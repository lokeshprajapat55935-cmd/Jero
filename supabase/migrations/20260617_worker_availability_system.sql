-- ============================================================
-- Migration: 20260617_worker_availability_system.sql
-- Description: Core schema and function updates for worker availability system.
--              Transitions available status to online.
-- ============================================================

-- 1. Migrate existing 'available' status to 'online'
UPDATE public.worker_availability
SET status = 'online'
WHERE status = 'available';

-- 2. Drop and recreate status check constraint to include online and unavailable, and exclude available
ALTER TABLE public.worker_availability
  DROP CONSTRAINT IF EXISTS worker_availability_status_check;

ALTER TABLE public.worker_availability
  ADD CONSTRAINT worker_availability_status_check
  CHECK (status IN ('offline', 'online', 'busy', 'unavailable'));

-- 3. Redefine check_worker_online_wallet_balance to check 'online'
CREATE OR REPLACE FUNCTION public.check_worker_online_wallet_balance()
RETURNS TRIGGER AS $$
DECLARE
  v_wallet_balance NUMERIC;
  v_min_balance NUMERIC;
BEGIN
  -- Only validate if status is transitioning to 'online'
  IF NEW.status = 'online' THEN
    -- Fetch wallet balance
    SELECT balance INTO v_wallet_balance
    FROM public.worker_wallets
    WHERE worker_id = NEW.worker_id;

    -- Fetch config min_wallet_balance
    SELECT value::NUMERIC INTO v_min_balance
    FROM public.platform_config
    WHERE key = 'min_wallet_balance' LIMIT 1;
    
    v_min_balance := COALESCE(v_min_balance, 500);

    IF v_wallet_balance IS NULL OR v_wallet_balance < v_min_balance THEN
      RAISE EXCEPTION 'Worker wallet balance (₹%) is below the minimum limit of ₹%. Please recharge to go online.', COALESCE(v_wallet_balance, 0), v_min_balance;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Redefine sync_booking_completion_and_release to update status to 'online' on completion/release
CREATE OR REPLACE FUNCTION public.sync_booking_completion_and_release()
RETURNS TRIGGER AS $$
BEGIN
  -- If status transitioned to completed, paid_completed, cancelled, or disputed
  IF NEW.status IN ('completed', 'paid_completed', 'cancelled', 'disputed') THEN
    -- Delete from active bookings
    DELETE FROM public.active_bookings WHERE booking_id = NEW.id;

    -- Update worker availability to online
    IF NEW.worker_id IS NOT NULL THEN
      UPDATE public.worker_availability
      SET status = 'online', current_booking_id = NULL, last_active_at = NOW()
      WHERE worker_id = NEW.worker_id;
    END IF;
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    -- Sync active booking status
    UPDATE public.active_bookings
    SET status = NEW.status
    WHERE booking_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Redefine get_nearby_dispatch_workers to check for 'online' status
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
      cos(radians(p_latitude)) * cos(radians(wl.latitude)) * 
      cos(radians(wl.longitude) - radians(p_longitude)) + 
      sin(radians(p_latitude)) * sin(radians(wl.latitude))
    ))::numeric AS distance_km,
    w.rating_avg,
    w.review_count,
    wl.latitude,
    wl.longitude
  FROM public.workers w
  JOIN public.worker_locations wl ON wl.worker_id = w.id
  JOIN public.worker_availability wa ON wa.worker_id = w.id
  WHERE w.status = 'active'
    AND w.category = p_category
    AND wa.status = 'online'
    AND wl.latitude IS NOT NULL
    AND wl.longitude IS NOT NULL
    AND wl.last_active_at >= NOW() - INTERVAL '15 minutes' -- Prevent stale/fake online presence
    AND (6371 * acos(
      cos(radians(p_latitude)) * cos(radians(wl.latitude)) * 
      cos(radians(wl.longitude) - radians(p_longitude)) + 
      sin(radians(p_latitude)) * sin(radians(wl.latitude))
    )) <= p_radius_km
  ORDER BY 
    distance_km ASC,
    w.rating_avg DESC,
    w.review_count DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. Redefine reject_dispatch_attempt to search for status 'online'
CREATE OR REPLACE FUNCTION public.reject_dispatch_attempt(
  p_booking_id UUID,
  p_worker_id UUID,
  p_rejection_reason TEXT DEFAULT 'rejected'
)
RETURNS JSONB AS $$
DECLARE
  v_dispatch RECORD;
  v_attempt RECORD;
  v_config_window INTEGER;
  v_config_max INTEGER;
  v_config_radius_expand NUMERIC;
  v_config_max_radius NUMERIC;
  v_next_worker RECORD;
  v_new_radius NUMERIC;
  v_notified INTEGER := 0;
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
    -- No workers available — update booking status
    UPDATE public.bookings
    SET status = 'cancelled',
        updated_at = NOW()
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

    -- Insert timeline
    INSERT INTO public.booking_timeline (booking_id, status, reason)
    VALUES (p_booking_id, 'cancelled', 'No available workers after ' || (v_dispatch.attempt_count + 1) || ' attempts');

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
  WHERE w.status = 'approved'
    AND w.category = v_booking.category
    AND wa.status = 'online'
    AND w.city_id = v_booking.city_id
    AND w.id NOT IN (
      SELECT da.worker_id
      FROM public.dispatch_attempts da
      WHERE da.dispatch_request_id = v_dispatch.id
    )
    AND (
      -- Within expanded radius if GPS available
      (
        v_booking.latitude IS NOT NULL
        AND wl.latitude IS NOT NULL
        AND public.calculate_distance_m(v_booking.latitude, v_booking.longitude, wl.latitude, wl.longitude) <= v_new_radius * 1000
      )
      OR
      -- City-level fallback if no GPS
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
    -- No more eligible workers within radius — expand and wait, or fail
    -- Try with max radius as final attempt
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
      -- Truly no workers — mark exhausted but keep broadcasting for a bit
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

-- 7. Redefine notify_nearby_workers to check status 'online'
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
    WHERE w.status = 'approved'
      AND w.category = p_category
      AND wa.status = 'online'
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

    -- Notify worker
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
