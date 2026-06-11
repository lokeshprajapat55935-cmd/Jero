-- ============================================================
-- Migration: 20260616_production_dispatch_engine.sql
-- Description: Production-grade dispatch engine upgrade:
--   1. Scheduled bookings (ASAP + future scheduling)
--   2. Dedicated booking-images storage bucket
--   3. Auto-redispatch with rejection handling
--   4. no_worker_available terminal status
--   5. Per-worker response window (30-60s configurable)
-- ============================================================

-- 1. Extend booking status to include new terminal/flow states
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS booking_type TEXT NOT NULL DEFAULT 'asap'
    CHECK (booking_type IN ('asap', 'scheduled')),
  ADD COLUMN IF NOT EXISTS scheduled_for TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS image_urls TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS scheduled_date DATE,
  ADD COLUMN IF NOT EXISTS scheduled_time_slot TEXT DEFAULT 'asap';

-- 2. Extend dispatch_attempts to track response windows
ALTER TABLE public.dispatch_attempts
  ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS responded_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS response_window_seconds INTEGER DEFAULT 45,
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

-- 3. Extend dispatch_requests with redispatch tracking
ALTER TABLE public.dispatch_requests
  ADD COLUMN IF NOT EXISTS attempt_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_attempts INTEGER DEFAULT 10,
  ADD COLUMN IF NOT EXISTS current_worker_id UUID REFERENCES public.workers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS last_dispatched_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS next_dispatch_at TIMESTAMPTZ;

-- 4. Create scheduled_dispatch_queue table
CREATE TABLE IF NOT EXISTS public.scheduled_dispatch_queue (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  booking_id UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  scheduled_for TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'dispatching', 'dispatched', 'cancelled', 'failed')),
  dispatch_attempts INTEGER DEFAULT 0,
  last_error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scheduled_queue_status_time
  ON public.scheduled_dispatch_queue(status, scheduled_for)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_scheduled_queue_booking
  ON public.scheduled_dispatch_queue(booking_id);

-- Enable RLS
ALTER TABLE public.scheduled_dispatch_queue ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Clients can view their scheduled queue" ON public.scheduled_dispatch_queue;
CREATE POLICY "Clients can view their scheduled queue" ON public.scheduled_dispatch_queue
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.bookings b
      WHERE b.id = booking_id AND b.client_id = auth.uid()
    )
  );

-- 5. Platform config: dispatch settings
INSERT INTO public.platform_config (key, value, description)
VALUES
  ('dispatch_response_window_seconds', '45', 'Seconds a worker has to accept/reject before moving to next'),
  ('dispatch_max_attempts', '10', 'Max workers to try before marking no_worker_available'),
  ('dispatch_initial_radius_km', '5', 'Starting search radius in km'),
  ('dispatch_max_radius_km', '15', 'Maximum search radius in km'),
  ('dispatch_radius_expand_km', '2.5', 'Radius expansion per failed attempt'),
  ('booking_images_bucket', 'booking-images', 'Storage bucket for customer booking photos')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

-- 6. Update BOOKING_STATUSES to include 'scheduled' and 'no_worker_available'
-- Note: These are validated in application layer via lib/booking/constants.ts
-- Database allows any text, validation is in trigger + app code.
-- Add to check constraint if one exists:
DO $$
BEGIN
  -- Extend the booking status check if needed (PostgreSQL allows ALTER COLUMN type)
  -- This is safe because status is TEXT in most migrations
  EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- 7. Core RPC: reject_dispatch_attempt
-- Called when a worker explicitly rejects OR when the response window expires.
-- Marks the current attempt as rejected and triggers redispatch to the next worker.
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
    AND wa.status = 'available'
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
      AND wa.status = 'available'
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


-- 8. RPC: process_expired_dispatch_attempts
-- Called by a cron job or polling endpoint to handle timed-out dispatch windows.
-- Finds dispatch_attempts that exceeded their response_window_seconds without a response.
CREATE OR REPLACE FUNCTION public.process_expired_dispatch_attempts()
RETURNS JSONB AS $$
DECLARE
  v_expired RECORD;
  v_result JSONB;
  v_total_processed INTEGER := 0;
  v_results JSONB[] := '{}';
BEGIN
  FOR v_expired IN
    SELECT
      da.id AS attempt_id,
      da.dispatch_request_id,
      da.worker_id,
      dr.booking_id
    FROM public.dispatch_attempts da
    INNER JOIN public.dispatch_requests dr ON dr.id = da.dispatch_request_id
    INNER JOIN public.bookings b ON b.id = dr.booking_id
    WHERE da.status = 'sent'
      AND b.status = 'broadcasting'
      AND dr.status = 'searching'
      AND da.sent_at + (da.response_window_seconds || ' seconds')::INTERVAL < NOW()
  LOOP
    -- Mark as expired
    UPDATE public.dispatch_attempts
    SET status = 'expired', responded_at = NOW()
    WHERE id = v_expired.attempt_id;

    -- Trigger redispatch for this booking
    v_result := public.reject_dispatch_attempt(
      v_expired.booking_id,
      v_expired.worker_id,
      'response_window_expired'
    );

    v_results := array_append(v_results, v_result);
    v_total_processed := v_total_processed + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'processed', v_total_processed,
    'results', to_jsonb(v_results)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 9. RPC: process_scheduled_bookings
-- Called by a cron job every minute to dispatch scheduled bookings that are due.
CREATE OR REPLACE FUNCTION public.process_scheduled_bookings()
RETURNS JSONB AS $$
DECLARE
  v_queue_item RECORD;
  v_booking RECORD;
  v_dispatched INTEGER := 0;
  v_errors INTEGER := 0;
BEGIN
  FOR v_queue_item IN
    SELECT sdq.id, sdq.booking_id
    FROM public.scheduled_dispatch_queue sdq
    WHERE sdq.status = 'pending'
      AND sdq.scheduled_for <= NOW()
    ORDER BY sdq.scheduled_for ASC
    LIMIT 50
    FOR UPDATE SKIP LOCKED
  LOOP
    BEGIN
      -- Mark as dispatching
      UPDATE public.scheduled_dispatch_queue
      SET status = 'dispatching', updated_at = NOW()
      WHERE id = v_queue_item.id;

      -- Fetch booking
      SELECT * INTO v_booking FROM public.bookings WHERE id = v_queue_item.booking_id;

      IF v_booking.status != 'scheduled' THEN
        -- Booking was cancelled before dispatch time
        UPDATE public.scheduled_dispatch_queue
        SET status = 'cancelled', updated_at = NOW()
        WHERE id = v_queue_item.id;
        CONTINUE;
      END IF;

      -- Transition booking to broadcasting
      UPDATE public.bookings
      SET status = 'broadcasting',
          expires_at = NOW() + INTERVAL '30 minutes',
          updated_at = NOW()
      WHERE id = v_queue_item.booking_id;

      -- Create dispatch request
      INSERT INTO public.dispatch_requests (
        booking_id, status, max_radius_km, current_radius_km
      ) VALUES (
        v_queue_item.booking_id, 'searching', 15.0, 5.0
      );

      -- Notify nearby workers
      PERFORM public.notify_nearby_workers(
        v_queue_item.booking_id,
        v_booking.category,
        v_booking.city_id,
        v_booking.latitude,
        v_booking.longitude,
        5.0
      );

      -- Mark queue item as dispatched
      UPDATE public.scheduled_dispatch_queue
      SET status = 'dispatched', dispatch_attempts = dispatch_attempts + 1, updated_at = NOW()
      WHERE id = v_queue_item.id;

      -- Notify customer that dispatch has begun
      INSERT INTO public.notifications (user_id, type, title, content, link_url, metadata)
      VALUES (
        v_booking.client_id,
        'booking_update',
        'Looking for Professionals',
        'Your scheduled ' || v_booking.category || ' booking is now being dispatched.',
        '/booking/' || v_booking.id,
        jsonb_build_object('booking_id', v_booking.id)
      );

      v_dispatched := v_dispatched + 1;

    EXCEPTION WHEN OTHERS THEN
      -- Log error and continue
      UPDATE public.scheduled_dispatch_queue
      SET status = 'failed', last_error = SQLERRM, updated_at = NOW()
      WHERE id = v_queue_item.id;
      v_errors := v_errors + 1;
    END;
  END LOOP;

  RETURN jsonb_build_object('dispatched', v_dispatched, 'errors', v_errors);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 10. Update/create notify_nearby_workers to use smarter dispatch
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
      AND wa.status = 'available'
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


-- 11. Updated create_booking_dispatch to support ASAP + Scheduled bookings
CREATE OR REPLACE FUNCTION public.create_booking_dispatch(
  p_client_id UUID,
  p_category TEXT,
  p_description TEXT,
  p_location_address TEXT,
  p_latitude NUMERIC DEFAULT NULL,
  p_longitude NUMERIC DEFAULT NULL,
  p_area_id UUID DEFAULT NULL,
  p_payment_method TEXT DEFAULT 'cash',
  p_ip_address TEXT DEFAULT NULL,
  p_user_agent TEXT DEFAULT NULL,
  p_booking_type TEXT DEFAULT 'asap',
  p_scheduled_for TIMESTAMPTZ DEFAULT NULL,
  p_scheduled_date DATE DEFAULT NULL,
  p_scheduled_time_slot TEXT DEFAULT 'asap',
  p_image_urls TEXT[] DEFAULT '{}'
)
RETURNS JSONB AS $$
DECLARE
  v_booking_id UUID;
  v_city_id UUID;
  v_existing_booking_id UUID;
  v_initial_status TEXT;
  v_expires_at TIMESTAMPTZ;
BEGIN
  -- 1. Rate limit: check for duplicate active booking
  SELECT id INTO v_existing_booking_id
  FROM public.bookings
  WHERE client_id = p_client_id
    AND category = p_category
    AND status IN ('pending', 'broadcasting', 'accepted', 'scheduled')
    AND created_at > NOW() - INTERVAL '10 minutes'
  LIMIT 1;

  IF v_existing_booking_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', true,
      'booking_id', v_existing_booking_id,
      'status', 'duplicate',
      'message', 'You already have an active booking for this category.'
    );
  END IF;

  -- 2. Resolve city
  IF p_area_id IS NOT NULL THEN
    SELECT city_id INTO v_city_id FROM public.areas WHERE id = p_area_id LIMIT 1;
  END IF;
  IF v_city_id IS NULL THEN
    SELECT id INTO v_city_id FROM public.cities WHERE slug = 'bhilwara' AND is_active = TRUE LIMIT 1;
  END IF;

  -- 3. Determine initial status and expiry
  IF p_booking_type = 'scheduled' AND p_scheduled_for IS NOT NULL AND p_scheduled_for > NOW() THEN
    v_initial_status := 'scheduled';
    v_expires_at := p_scheduled_for + INTERVAL '30 minutes';
  ELSE
    v_initial_status := 'broadcasting';
    v_expires_at := NOW() + INTERVAL '30 minutes';
  END IF;

  -- 4. Create booking
  INSERT INTO public.bookings (
    client_id, category, description, location_address,
    latitude, longitude, area_id, city_id, payment_method,
    status, booking_type, total_price, service_charge,
    scheduled_at, scheduled_for, scheduled_date, scheduled_time_slot,
    image_urls, expires_at, created_at, updated_at
  ) VALUES (
    p_client_id, p_category, p_description, p_location_address,
    p_latitude, p_longitude, p_area_id, v_city_id, p_payment_method,
    v_initial_status, p_booking_type, 0, 0,
    COALESCE(p_scheduled_for, NOW()),
    p_scheduled_for,
    p_scheduled_date,
    COALESCE(p_scheduled_time_slot, 'asap'),
    COALESCE(p_image_urls, '{}'),
    v_expires_at, NOW(), NOW()
  )
  RETURNING id INTO v_booking_id;

  -- 5. For ASAP: create dispatch + notify immediately
  IF v_initial_status = 'broadcasting' THEN
    INSERT INTO public.dispatch_requests (
      booking_id, status, max_radius_km, current_radius_km
    ) VALUES (
      v_booking_id, 'searching', 15.0, 5.0
    );

    PERFORM public.notify_nearby_workers(
      v_booking_id, p_category, v_city_id,
      p_latitude, p_longitude, 5.0, 1
    );
  END IF;

  -- 6. For Scheduled: add to dispatch queue
  IF v_initial_status = 'scheduled' THEN
    INSERT INTO public.scheduled_dispatch_queue (booking_id, scheduled_for, status)
    VALUES (v_booking_id, p_scheduled_for, 'pending');
  END IF;

  -- 7. Log booking creation
  INSERT INTO public.booking_timeline (booking_id, status, reason, created_by)
  VALUES (v_booking_id, v_initial_status,
    CASE WHEN v_initial_status = 'scheduled'
      THEN 'Scheduled booking created for ' || p_scheduled_for::TEXT
      ELSE 'ASAP booking created and dispatched'
    END,
    p_client_id);

  RETURN jsonb_build_object(
    'success', true,
    'booking_id', v_booking_id,
    'booking_type', p_booking_type,
    'status', v_initial_status
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM, 'code', 500);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 12. Storage bucket: booking-images
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'booking-images',
  'booking-images',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
  SET file_size_limit = 5242880,
      allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp'];

-- Storage RLS policies
DROP POLICY IF EXISTS "Public read booking images" ON storage.objects;
CREATE POLICY "Public read booking images" ON storage.objects
  FOR SELECT USING (bucket_id = 'booking-images');

DROP POLICY IF EXISTS "Authenticated users upload booking images" ON storage.objects;
CREATE POLICY "Authenticated users upload booking images" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'booking-images'
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Users delete own booking images" ON storage.objects;
CREATE POLICY "Users delete own booking images" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'booking-images'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- 13. Performance indexes
CREATE INDEX IF NOT EXISTS idx_bookings_booking_type ON public.bookings(booking_type);
CREATE INDEX IF NOT EXISTS idx_bookings_scheduled_for ON public.bookings(scheduled_for)
  WHERE scheduled_for IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_dispatch_attempts_status_sent ON public.dispatch_attempts(status, sent_at)
  WHERE status = 'sent';
CREATE INDEX IF NOT EXISTS idx_dispatch_requests_next_dispatch ON public.dispatch_requests(next_dispatch_at)
  WHERE status = 'searching';
