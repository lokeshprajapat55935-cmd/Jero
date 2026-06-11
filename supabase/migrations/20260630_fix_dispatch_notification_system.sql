-- ============================================================
-- Migration: 20260630_fix_dispatch_notification_system.sql
-- Description: Fixes the complete dispatch notification pipeline:
--
--   BUG #1 FIX: get_nearby_dispatch_workers uses 'available'/'active'
--               instead of 'online'/'approved' — zero workers matched
--   BUG #2 FIX: Supabase Realtime needs REPLICA IDENTITY FULL on
--               notifications table to emit full row payloads
--   BUG #3 FIX: notifications table must be in supabase_realtime
--               publication for postgres_changes to work
--   BUG #4 FIX: Any remaining inline fallback queries using 'available'
--               status are corrected
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- FIX 1: REPLICA IDENTITY FULL on notifications
-- Required for Supabase Realtime postgres_changes to emit
-- the full row (including user_id, type, metadata) — without
-- this, payload.new is only {id: ...} and the browser-side
-- filter `user_id=eq.{workerId}` cannot match.
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.notifications REPLICA IDENTITY FULL;

-- ─────────────────────────────────────────────────────────────
-- FIX 2: Add notifications to Supabase Realtime publication
-- Supabase creates a publication named 'supabase_realtime'.
-- Tables must be explicitly added to it for postgres_changes
-- subscriptions to fire.
-- ─────────────────────────────────────────────────────────────
DO $$
BEGIN
  -- Add notifications to the realtime publication if not already there
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'notifications'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────
-- FIX 3: Fix get_nearby_dispatch_workers
-- Previous versions checked:
--   w.status = 'active'       → should be 'approved'
--   wa.status = 'available'   → should be 'online'
-- The 20260617 migration updated notify_nearby_workers correctly
-- but get_nearby_dispatch_workers (used in old create_booking_dispatch
-- code paths via GPS branch) was left with the wrong values.
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_nearby_dispatch_workers(
  p_latitude NUMERIC,
  p_longitude NUMERIC,
  p_category TEXT,
  p_radius_km NUMERIC,
  p_limit INTEGER
)
RETURNS TABLE (
  worker_id UUID,
  distance_km NUMERIC,
  rating_avg NUMERIC,
  review_count INTEGER,
  latitude NUMERIC,
  longitude NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    w.id AS worker_id,
    (6371 * acos(
      LEAST(1.0, GREATEST(-1.0,
        cos(radians(p_latitude)) * cos(radians(wl.latitude)) *
        cos(radians(wl.longitude) - radians(p_longitude)) +
        sin(radians(p_latitude)) * sin(radians(wl.latitude))
      ))
    ))::numeric AS distance_km,
    w.rating_avg,
    w.review_count,
    wl.latitude,
    wl.longitude
  FROM public.workers w
  JOIN public.worker_locations wl ON wl.worker_id = w.id
  JOIN public.worker_availability wa ON wa.worker_id = w.id
  WHERE w.status = 'approved'           -- FIX: was 'active'
    AND w.category = p_category
    AND wa.status = 'online'            -- FIX: was 'available'
    AND wl.latitude IS NOT NULL
    AND wl.longitude IS NOT NULL
    AND (6371 * acos(
      LEAST(1.0, GREATEST(-1.0,
        cos(radians(p_latitude)) * cos(radians(wl.latitude)) *
        cos(radians(wl.longitude) - radians(p_longitude)) +
        sin(radians(p_latitude)) * sin(radians(wl.latitude))
      ))
    )) <= p_radius_km
  ORDER BY
    distance_km ASC,
    w.rating_avg DESC,
    w.review_count DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─────────────────────────────────────────────────────────────
-- FIX 4: Re-apply notify_nearby_workers with correct status
-- (idempotent — ensures the production DB has the correct version)
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.notify_nearby_workers(
  p_booking_id UUID,
  p_category TEXT,
  p_city_id UUID,
  p_latitude NUMERIC,
  p_longitude NUMERIC,
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
  SELECT COALESCE(value::INTEGER, 45) INTO v_config_window
    FROM public.platform_config WHERE key = 'dispatch_response_window_seconds';

  SELECT id INTO v_dispatch_id FROM public.dispatch_requests
  WHERE booking_id = p_booking_id AND status = 'searching'
  LIMIT 1;

  -- Find the best available worker NOT already attempted
  FOR v_worker IN
    SELECT w.id
    FROM public.workers w
    LEFT JOIN public.worker_locations wl ON wl.worker_id = w.id
    INNER JOIN public.worker_availability wa ON wa.worker_id = w.id
    WHERE w.status = 'approved'            -- CORRECT value
      AND w.category = p_category
      AND wa.status = 'online'             -- CORRECT value
      AND (w.city_id = p_city_id OR wl.city_id = p_city_id)
      AND (
        v_dispatch_id IS NULL
        OR w.id NOT IN (
          SELECT da.worker_id FROM public.dispatch_attempts da
          WHERE da.dispatch_request_id = v_dispatch_id
        )
      )
      AND (
        (
          p_latitude IS NOT NULL
          AND wl.latitude IS NOT NULL
          AND public.calculate_distance_m(p_latitude, p_longitude, wl.latitude, wl.longitude) <= p_radius_km * 1000
        )
        OR p_latitude IS NULL
      )
    ORDER BY
      CASE WHEN wl.latitude IS NOT NULL AND p_latitude IS NOT NULL
        THEN public.calculate_distance_m(p_latitude, p_longitude, wl.latitude, wl.longitude)
        ELSE 99999999
      END ASC,
      w.rating_avg DESC
    LIMIT p_limit
  LOOP
    -- Insert dispatch attempt
    IF v_dispatch_id IS NOT NULL THEN
      INSERT INTO public.dispatch_attempts (
        dispatch_request_id, worker_id, status, sent_at, response_window_seconds
      ) VALUES (
        v_dispatch_id, v_worker.id, 'sent', NOW(), v_config_window
      )
      ON CONFLICT (dispatch_request_id, worker_id) DO NOTHING;
    END IF;

    -- Notify worker via notifications table (triggers Realtime broadcast)
    INSERT INTO public.notifications (user_id, type, title, content, link_url, metadata, is_read)
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

    -- Update dispatch request with current worker
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

  -- Update notified_worker_count on booking
  UPDATE public.bookings
  SET notified_worker_count = COALESCE(notified_worker_count, 0) + v_notified
  WHERE id = p_booking_id;

  RETURN v_notified;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─────────────────────────────────────────────────────────────
-- FIX 5: Re-apply reject_dispatch_attempt with correct 'online' filter
-- (idempotent — already correct in 20260617, re-applied for safety)
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.reject_dispatch_attempt(
  p_booking_id UUID,
  p_worker_id UUID,
  p_rejection_reason TEXT DEFAULT 'rejected'
)
RETURNS JSONB AS $$
DECLARE
  v_dispatch RECORD;
  v_config_window INTEGER;
  v_config_max INTEGER;
  v_config_radius_expand NUMERIC;
  v_config_max_radius NUMERIC;
  v_next_worker RECORD;
  v_new_radius NUMERIC;
  v_booking RECORD;
BEGIN
  -- Fetch booking
  SELECT * INTO v_booking FROM public.bookings WHERE id = p_booking_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Booking not found');
  END IF;
  IF v_booking.status NOT IN ('broadcasting') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Booking is no longer in broadcasting state');
  END IF;

  -- Fetch dispatch request
  SELECT * INTO v_dispatch FROM public.dispatch_requests
  WHERE booking_id = p_booking_id AND status = 'searching'
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'No active dispatch request found');
  END IF;

  -- Mark this attempt as rejected
  UPDATE public.dispatch_attempts
  SET status = 'rejected',
      responded_at = NOW(),
      rejection_reason = p_rejection_reason
  WHERE dispatch_request_id = v_dispatch.id
    AND worker_id = p_worker_id
    AND status = 'sent';

  -- Increment attempt count
  UPDATE public.dispatch_requests
  SET attempt_count = attempt_count + 1,
      current_worker_id = NULL,
      updated_at = NOW()
  WHERE id = v_dispatch.id;

  -- Load config
  SELECT COALESCE(value::INTEGER, 45) INTO v_config_window
    FROM public.platform_config WHERE key = 'dispatch_response_window_seconds';
  SELECT COALESCE(value::INTEGER, 10) INTO v_config_max
    FROM public.platform_config WHERE key = 'dispatch_max_attempts';
  SELECT COALESCE(value::NUMERIC, 2.5) INTO v_config_radius_expand
    FROM public.platform_config WHERE key = 'dispatch_radius_expand_km';
  SELECT COALESCE(value::NUMERIC, 15.0) INTO v_config_max_radius
    FROM public.platform_config WHERE key = 'dispatch_max_radius_km';

  -- Check if we've exhausted max attempts
  IF (v_dispatch.attempt_count + 1) >= v_config_max THEN
    UPDATE public.bookings
    SET status = 'no_worker_available', updated_at = NOW()
    WHERE id = p_booking_id;

    UPDATE public.dispatch_requests
    SET status = 'expired', updated_at = NOW()
    WHERE id = v_dispatch.id;

    -- Notify customer
    INSERT INTO public.notifications (user_id, type, title, content, link_url, metadata)
    VALUES (
      v_booking.client_id,
      'booking_no_worker',
      'No Workers Available',
      'We could not find an available professional for your ' || v_booking.category || ' request. Please try again in a few minutes.',
      '/booking/new',
      jsonb_build_object('booking_id', p_booking_id, 'reason', 'no_worker_available')
    );

    INSERT INTO public.booking_timeline (booking_id, status, reason)
    VALUES (p_booking_id, 'no_worker_available', 'No available workers after ' || (v_dispatch.attempt_count + 1) || ' attempts');

    RETURN jsonb_build_object(
      'success', true,
      'action', 'no_worker_available',
      'attempts', v_dispatch.attempt_count + 1
    );
  END IF;

  -- Expand radius if needed (every 3 rejected attempts)
  v_new_radius := v_dispatch.current_radius_km;
  IF (v_dispatch.attempt_count + 1) % 3 = 0 THEN
    v_new_radius := LEAST(v_dispatch.current_radius_km + v_config_radius_expand, v_config_max_radius);
    UPDATE public.dispatch_requests
    SET current_radius_km = v_new_radius, updated_at = NOW()
    WHERE id = v_dispatch.id;
  END IF;

  -- Find next eligible worker (not already attempted)
  SELECT w.id, wl.latitude, wl.longitude
  INTO v_next_worker
  FROM public.workers w
  LEFT JOIN public.worker_locations wl ON wl.worker_id = w.id
  INNER JOIN public.worker_availability wa ON wa.worker_id = w.id
  WHERE w.status = 'approved'          -- CORRECT
    AND w.category = v_booking.category
    AND wa.status = 'online'           -- CORRECT
    AND w.city_id = v_booking.city_id
    AND w.id NOT IN (
      SELECT da.worker_id
      FROM public.dispatch_attempts da
      WHERE da.dispatch_request_id = v_dispatch.id
    )
    AND (
      (
        v_booking.latitude IS NOT NULL
        AND wl.latitude IS NOT NULL
        AND public.calculate_distance_m(v_booking.latitude, v_booking.longitude, wl.latitude, wl.longitude) <= v_new_radius * 1000
      )
      OR
      (v_booking.latitude IS NULL AND w.city_id = v_booking.city_id)
    )
  ORDER BY
    CASE WHEN wl.latitude IS NOT NULL AND v_booking.latitude IS NOT NULL
      THEN public.calculate_distance_m(v_booking.latitude, v_booking.longitude, wl.latitude, wl.longitude)
      ELSE 99999999
    END ASC,
    w.rating_avg DESC
  LIMIT 1;

  IF v_next_worker IS NULL THEN
    SELECT w.id INTO v_next_worker
    FROM public.workers w
    INNER JOIN public.worker_availability wa ON wa.worker_id = w.id
    WHERE w.status = 'approved'
      AND w.category = v_booking.category
      AND wa.status = 'online'
      AND w.city_id = v_booking.city_id
      AND w.id NOT IN (
        SELECT da.worker_id FROM public.dispatch_attempts da
        WHERE da.dispatch_request_id = v_dispatch.id
      )
    ORDER BY w.rating_avg DESC
    LIMIT 1;

    IF v_next_worker IS NULL THEN
      RETURN jsonb_build_object(
        'success', true,
        'action', 'waiting',
        'message', 'No additional workers found right now, keeping broadcast active'
      );
    END IF;
  END IF;

  -- Dispatch to next worker
  INSERT INTO public.dispatch_attempts (
    dispatch_request_id, worker_id, status, sent_at,
    response_window_seconds
  ) VALUES (
    v_dispatch.id, v_next_worker.id, 'sent', NOW(),
    v_config_window
  )
  ON CONFLICT (dispatch_request_id, worker_id) DO NOTHING;

  -- Notify next worker
  INSERT INTO public.notifications (user_id, type, title, content, link_url, metadata, is_read)
  VALUES (
    v_next_worker.id,
    'booking_request',
    'New Job Available!',
    'A new ' || v_booking.category || ' job is available near you.',
    '/partner/jobs',
    jsonb_build_object(
      'booking_id', p_booking_id,
      'response_window_seconds', v_config_window,
      'sent_at', NOW()
    ),
    FALSE
  );

  -- Update dispatch request
  UPDATE public.dispatch_requests
  SET current_worker_id = v_next_worker.id,
      last_dispatched_at = NOW(),
      next_dispatch_at = NOW() + (v_config_window || ' seconds')::INTERVAL,
      updated_at = NOW()
  WHERE id = v_dispatch.id;

  RETURN jsonb_build_object(
    'success', true,
    'action', 'redispatched',
    'next_worker_id', v_next_worker.id,
    'attempt_number', v_dispatch.attempt_count + 1
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─────────────────────────────────────────────────────────────
-- FIX 6: Data fix — migrate any remaining 'available' worker
-- availability status rows to 'online' (in case the 20260617
-- migration didn't run completely or was applied to a subset).
-- ─────────────────────────────────────────────────────────────
UPDATE public.worker_availability
SET status = 'online'
WHERE status = 'available';

-- ─────────────────────────────────────────────────────────────
-- FIX 7: Ensure the status check constraint allows valid values only
-- (idempotent — 20260617 already added this, re-applying for safety)
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.worker_availability
  DROP CONSTRAINT IF EXISTS worker_availability_status_check;

ALTER TABLE public.worker_availability
  ADD CONSTRAINT worker_availability_status_check
  CHECK (status IN ('offline', 'online', 'busy', 'unavailable'));

-- ─────────────────────────────────────────────────────────────
-- FIX 8: Add index to help Realtime row filtering performance
-- ─────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_notifications_user_type_created
  ON public.notifications(user_id, type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
  ON public.notifications(user_id, is_read)
  WHERE is_read = FALSE;

-- ─────────────────────────────────────────────────────────────
-- VERIFICATION QUERIES (run manually to confirm fix worked)
-- ─────────────────────────────────────────────────────────────
-- 1. Check notifications REPLICA IDENTITY:
--    SELECT relreplident FROM pg_class WHERE relname = 'notifications';
--    Expected: 'f' (FULL)
--
-- 2. Check notifications in realtime publication:
--    SELECT tablename FROM pg_publication_tables
--    WHERE pubname = 'supabase_realtime' AND tablename = 'notifications';
--    Expected: 1 row returned
--
-- 3. Check no workers are stuck on 'available':
--    SELECT status, count(*) FROM worker_availability GROUP BY status;
--    Expected: no 'available' rows
--
-- 4. Test dispatch with a known online+approved worker:
--    SELECT notify_nearby_workers(<booking_id>, 'Electrician', <city_id>, NULL, NULL, 5.0, 1);
--    Expected: returns 1 (or more if multiple online workers exist)
