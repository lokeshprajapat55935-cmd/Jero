-- ============================================================
-- Migration: Fix booking dispatch city source
--
-- Root cause:
--   POST /api/bookings -> create_booking_dispatch()
--   -> notify_nearby_workers() fails with:
--      column w.city_id does not exist
--
-- Actual schema:
--   public.workers does not store city_id / area_id.
--   public.worker_locations stores worker city_id / area_id.
--
-- Minimal fix:
--   Recreate notify_nearby_workers() so worker city matching uses
--   public.worker_locations.city_id instead of public.workers.city_id.
--   No booking, onboarding, OTP, payment, wallet, or dispatch state
--   workflow changes are made.
-- ============================================================

CREATE OR REPLACE FUNCTION public.notify_nearby_workers(
  p_booking_id UUID,
  p_category TEXT,
  p_city_id UUID,
  p_latitude NUMERIC DEFAULT NULL,
  p_longitude NUMERIC DEFAULT NULL,
  p_radius_km NUMERIC DEFAULT 5.0,
  p_limit INTEGER DEFAULT 1
)
RETURNS INTEGER AS $$
DECLARE
  v_worker RECORD;
  v_notified INTEGER := 0;
  v_dispatch_id UUID;
  v_config_window INTEGER;
BEGIN
  SELECT COALESCE(value::INTEGER, 45)
  INTO v_config_window
  FROM public.platform_config
  WHERE key = 'dispatch_response_window_seconds';

  IF v_config_window IS NULL THEN
    v_config_window := 45;
  END IF;

  SELECT id
  INTO v_dispatch_id
  FROM public.dispatch_requests
  WHERE booking_id = p_booking_id
    AND status = 'searching'
  LIMIT 1;

  FOR v_worker IN
    SELECT w.id
    FROM public.workers w
    INNER JOIN public.worker_locations wl ON wl.worker_id = w.id
    INNER JOIN public.worker_availability wa ON wa.worker_id = w.id
    WHERE w.status = 'approved'
      AND w.category = p_category
      AND wa.status = 'online'
      AND wl.city_id = p_city_id
      AND (
        v_dispatch_id IS NULL
        OR w.id NOT IN (
          SELECT da.worker_id
          FROM public.dispatch_attempts da
          WHERE da.dispatch_request_id = v_dispatch_id
        )
      )
      AND (
        (
          p_latitude IS NOT NULL
          AND p_longitude IS NOT NULL
          AND wl.latitude IS NOT NULL
          AND wl.longitude IS NOT NULL
          AND public.calculate_distance_m(
            p_latitude,
            p_longitude,
            wl.latitude,
            wl.longitude
          ) <= p_radius_km * 1000
        )
        OR p_latitude IS NULL
        OR p_longitude IS NULL
      )
    ORDER BY
      CASE
        WHEN wl.latitude IS NOT NULL
          AND wl.longitude IS NOT NULL
          AND p_latitude IS NOT NULL
          AND p_longitude IS NOT NULL
        THEN public.calculate_distance_m(
          p_latitude,
          p_longitude,
          wl.latitude,
          wl.longitude
        )
        ELSE 99999999
      END ASC,
      w.rating_avg DESC
    LIMIT p_limit
  LOOP
    IF v_dispatch_id IS NOT NULL THEN
      INSERT INTO public.dispatch_attempts (
        dispatch_request_id,
        worker_id,
        status,
        sent_at,
        response_window_seconds
      )
      VALUES (
        v_dispatch_id,
        v_worker.id,
        'sent',
        NOW(),
        v_config_window
      )
      ON CONFLICT (dispatch_request_id, worker_id) DO NOTHING;
    END IF;

    INSERT INTO public.notifications (
      user_id,
      type,
      title,
      content,
      link_url,
      metadata,
      is_read
    )
    VALUES (
      v_worker.id,
      'booking_request',
      'New Job Available!',
      'A new ' || p_category || ' job is available near you.',
      '/partner/jobs',
      jsonb_build_object(
        'booking_id', p_booking_id,
        'response_window_seconds', v_config_window,
        'sent_at', NOW()
      ),
      FALSE
    )
    ON CONFLICT DO NOTHING;

    IF v_dispatch_id IS NOT NULL THEN
      UPDATE public.dispatch_requests
      SET current_worker_id = v_worker.id,
          last_dispatched_at = NOW(),
          next_dispatch_at = NOW() + (v_config_window || ' seconds')::INTERVAL,
          updated_at = NOW()
      WHERE id = v_dispatch_id;
    END IF;

    v_notified := v_notified + 1;
  END LOOP;

  UPDATE public.bookings
  SET notified_worker_count = COALESCE(notified_worker_count, 0) + v_notified
  WHERE id = p_booking_id;

  RETURN v_notified;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
