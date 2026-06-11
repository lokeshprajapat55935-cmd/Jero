-- ============================================================
-- APPLY THIS IN SUPABASE SQL EDITOR
-- Fix: POST /api/bookings → 500 Internal Server Error
-- Root cause: workers table missing city_id column
-- ============================================================

-- STEP 1: Add city_id and area_id columns to workers
ALTER TABLE public.workers
  ADD COLUMN IF NOT EXISTS city_id UUID REFERENCES public.cities(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS area_id UUID REFERENCES public.areas(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_workers_city_id ON public.workers(city_id) WHERE city_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_workers_status_category ON public.workers(status, category);

-- STEP 2: Backfill city_id from worker_locations
UPDATE public.workers w
SET city_id = wl.city_id
FROM public.worker_locations wl
WHERE wl.worker_id = w.id AND wl.city_id IS NOT NULL AND w.city_id IS NULL;

-- Default remaining workers to Bhilwara
UPDATE public.workers
SET city_id = (SELECT id FROM public.cities WHERE slug = 'bhilwara' AND is_active = TRUE LIMIT 1)
WHERE city_id IS NULL;

-- STEP 3: Fix notify_nearby_workers (remove w.city_id ref, use correct status)
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
  SELECT COALESCE(value::INTEGER, 45) INTO v_config_window
    FROM public.platform_config WHERE key = 'dispatch_response_window_seconds';
  IF v_config_window IS NULL THEN v_config_window := 45; END IF;

  SELECT id INTO v_dispatch_id FROM public.dispatch_requests
  WHERE booking_id = p_booking_id AND status = 'searching' LIMIT 1;

  FOR v_worker IN
    SELECT w.id
    FROM public.workers w
    LEFT JOIN public.worker_locations wl ON wl.worker_id = w.id
    INNER JOIN public.worker_availability wa ON wa.worker_id = w.id
    WHERE w.status = 'approved'
      AND w.category = p_category
      AND wa.status = 'online'
      AND (w.city_id = p_city_id OR wl.city_id = p_city_id)
      AND (v_dispatch_id IS NULL OR w.id NOT IN (
          SELECT da.worker_id FROM public.dispatch_attempts da
          WHERE da.dispatch_request_id = v_dispatch_id))
      AND (
        (p_latitude IS NOT NULL AND p_longitude IS NOT NULL AND wl.latitude IS NOT NULL AND wl.longitude IS NOT NULL
          AND public.calculate_distance_m(p_latitude, p_longitude, wl.latitude, wl.longitude) <= p_radius_km * 1000)
        OR p_latitude IS NULL OR p_longitude IS NULL)
    ORDER BY
      CASE WHEN wl.latitude IS NOT NULL AND p_latitude IS NOT NULL AND p_longitude IS NOT NULL
        THEN public.calculate_distance_m(p_latitude, p_longitude, wl.latitude, wl.longitude)
        ELSE 99999999 END ASC,
      w.rating_avg DESC
    LIMIT p_limit
  LOOP
    IF v_dispatch_id IS NOT NULL THEN
      INSERT INTO public.dispatch_attempts (dispatch_request_id, worker_id, status, sent_at, response_window_seconds)
      VALUES (v_dispatch_id, v_worker.id, 'sent', NOW(), v_config_window)
      ON CONFLICT (dispatch_request_id, worker_id) DO NOTHING;
    END IF;

    INSERT INTO public.notifications (user_id, type, title, content, link_url, metadata, is_read)
    VALUES (v_worker.id, 'booking_request', 'New Job Available!',
      'A new ' || p_category || ' job is available near you.', '/partner/jobs',
      jsonb_build_object('booking_id', p_booking_id, 'response_window_seconds', v_config_window, 'sent_at', NOW()), FALSE)
    ON CONFLICT DO NOTHING;

    IF v_dispatch_id IS NOT NULL THEN
      UPDATE public.dispatch_requests
      SET current_worker_id = v_worker.id, last_dispatched_at = NOW(),
          next_dispatch_at = NOW() + (v_config_window || ' seconds')::INTERVAL, updated_at = NOW()
      WHERE id = v_dispatch_id;
    END IF;

    v_notified := v_notified + 1;
  END LOOP;

  UPDATE public.bookings SET notified_worker_count = COALESCE(notified_worker_count, 0) + v_notified WHERE id = p_booking_id;
  RETURN v_notified;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- STEP 4: Fix create_booking_dispatch
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
  v_service_charge NUMERIC := 250;
BEGIN
  SELECT id INTO v_existing_booking_id
  FROM public.bookings
  WHERE client_id = p_client_id AND category = p_category
    AND status IN ('pending', 'broadcasting', 'accepted', 'scheduled')
    AND created_at > NOW() - INTERVAL '10 minutes'
  LIMIT 1;

  IF v_existing_booking_id IS NOT NULL THEN
    RETURN jsonb_build_object('success', true, 'booking_id', v_existing_booking_id, 'status', 'duplicate',
      'message', 'You already have an active booking for this category.');
  END IF;

  IF p_area_id IS NOT NULL THEN SELECT city_id INTO v_city_id FROM public.areas WHERE id = p_area_id LIMIT 1; END IF;
  IF v_city_id IS NULL THEN SELECT city_id INTO v_city_id FROM public.clients WHERE id = p_client_id LIMIT 1; END IF;
  IF v_city_id IS NULL THEN SELECT id INTO v_city_id FROM public.cities WHERE slug = 'bhilwara' AND is_active = TRUE LIMIT 1; END IF;

  IF p_category = 'Electrician' THEN
    CASE p_description WHEN 'Fan Repair' THEN v_service_charge := 250; WHEN 'Switchboard Installation' THEN v_service_charge := 350;
      WHEN 'Short Circuit Inspection' THEN v_service_charge := 400; WHEN 'Inverter Repair/Service' THEN v_service_charge := 600;
      ELSE v_service_charge := 250; END CASE;
  ELSIF p_category = 'Plumber' THEN
    CASE p_description WHEN 'Tap/Fitted Leakage' THEN v_service_charge := 200; WHEN 'Toilet Flush Repair' THEN v_service_charge := 300;
      WHEN 'Washbasin Installation' THEN v_service_charge := 450; WHEN 'Water Tank Cleaning' THEN v_service_charge := 800;
      ELSE v_service_charge := 250; END CASE;
  END IF;

  IF p_booking_type = 'scheduled' AND p_scheduled_for IS NOT NULL AND p_scheduled_for > NOW() THEN
    v_initial_status := 'scheduled'; v_expires_at := p_scheduled_for + INTERVAL '30 minutes';
  ELSE
    v_initial_status := 'broadcasting'; v_expires_at := NOW() + INTERVAL '30 minutes';
  END IF;

  INSERT INTO public.bookings (
    client_id, category, description, location_address, latitude, longitude,
    area_id, city_id, payment_method, status, booking_type, total_price,
    service_charge, base_service_charge, scheduled_at, scheduled_for,
    scheduled_date, scheduled_time_slot, image_urls, expires_at, created_at, updated_at
  ) VALUES (
    p_client_id, p_category, p_description, p_location_address, p_latitude, p_longitude,
    p_area_id, v_city_id, p_payment_method, v_initial_status, p_booking_type, v_service_charge,
    v_service_charge, v_service_charge, COALESCE(p_scheduled_for, NOW()), p_scheduled_for,
    p_scheduled_date, COALESCE(p_scheduled_time_slot, 'asap'), COALESCE(p_image_urls, '{}'),
    v_expires_at, NOW(), NOW()
  ) RETURNING id INTO v_booking_id;

  INSERT INTO public.booking_timeline (booking_id, status, reason, created_by)
  VALUES (v_booking_id, v_initial_status,
    CASE WHEN v_initial_status = 'scheduled' THEN 'Scheduled booking created for ' || p_scheduled_for::TEXT
         ELSE 'ASAP booking created and dispatched' END, p_client_id);

  IF v_initial_status = 'broadcasting' THEN
    INSERT INTO public.dispatch_requests (booking_id, status, max_radius_km, current_radius_km)
    VALUES (v_booking_id, 'searching', 15.0, 5.0);
    PERFORM public.notify_nearby_workers(v_booking_id, p_category, v_city_id, p_latitude, p_longitude, 5.0, 1);
  END IF;

  IF v_initial_status = 'scheduled' THEN
    INSERT INTO public.scheduled_dispatch_queue (booking_id, scheduled_for, status)
    VALUES (v_booking_id, p_scheduled_for, 'pending');
  END IF;

  RETURN jsonb_build_object('success', true, 'booking_id', v_booking_id, 'booking_type', p_booking_type, 'status', v_initial_status);

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM, 'code', 500);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- STEP 5: Fix reject_dispatch_attempt (remove w.city_id reference)
CREATE OR REPLACE FUNCTION public.reject_dispatch_attempt(
  p_booking_id UUID,
  p_worker_id UUID,
  p_rejection_reason TEXT DEFAULT 'rejected'
)
RETURNS JSONB AS $$
DECLARE
  v_dispatch RECORD; v_config_window INTEGER; v_config_max INTEGER;
  v_config_radius_expand NUMERIC; v_config_max_radius NUMERIC;
  v_next_worker RECORD; v_new_radius NUMERIC; v_booking RECORD;
BEGIN
  SELECT * INTO v_booking FROM public.bookings WHERE id = p_booking_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'Booking not found'); END IF;
  IF v_booking.status NOT IN ('broadcasting') THEN RETURN jsonb_build_object('success', false, 'error', 'Booking not in broadcasting state'); END IF;

  SELECT * INTO v_dispatch FROM public.dispatch_requests WHERE booking_id = p_booking_id AND status = 'searching' FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'No active dispatch request found'); END IF;

  UPDATE public.dispatch_attempts SET status = 'rejected', responded_at = NOW(), rejection_reason = p_rejection_reason
  WHERE dispatch_request_id = v_dispatch.id AND worker_id = p_worker_id AND status = 'sent';

  UPDATE public.dispatch_requests SET attempt_count = attempt_count + 1, current_worker_id = NULL, updated_at = NOW()
  WHERE id = v_dispatch.id;

  SELECT COALESCE(value::INTEGER, 45) INTO v_config_window FROM public.platform_config WHERE key = 'dispatch_response_window_seconds';
  SELECT COALESCE(value::INTEGER, 10) INTO v_config_max FROM public.platform_config WHERE key = 'dispatch_max_attempts';
  SELECT COALESCE(value::NUMERIC, 2.5) INTO v_config_radius_expand FROM public.platform_config WHERE key = 'dispatch_radius_expand_km';
  SELECT COALESCE(value::NUMERIC, 15.0) INTO v_config_max_radius FROM public.platform_config WHERE key = 'dispatch_max_radius_km';

  IF (v_dispatch.attempt_count + 1) >= v_config_max THEN
    UPDATE public.bookings SET status = 'no_worker_available', updated_at = NOW() WHERE id = p_booking_id;
    UPDATE public.dispatch_requests SET status = 'expired', updated_at = NOW() WHERE id = v_dispatch.id;
    INSERT INTO public.notifications (user_id, type, title, content, link_url, metadata)
    VALUES (v_booking.client_id, 'booking_no_worker', 'No Workers Available',
      'We could not find an available professional for your ' || v_booking.category || ' request.', '/booking/new',
      jsonb_build_object('booking_id', p_booking_id, 'reason', 'no_worker_available'));
    INSERT INTO public.booking_timeline (booking_id, status, reason)
    VALUES (p_booking_id, 'no_worker_available', 'No available workers after ' || (v_dispatch.attempt_count + 1) || ' attempts');
    RETURN jsonb_build_object('success', true, 'action', 'no_worker_available', 'attempts', v_dispatch.attempt_count + 1);
  END IF;

  v_new_radius := v_dispatch.current_radius_km;
  IF (v_dispatch.attempt_count + 1) % 3 = 0 THEN
    v_new_radius := LEAST(v_dispatch.current_radius_km + v_config_radius_expand, v_config_max_radius);
    UPDATE public.dispatch_requests SET current_radius_km = v_new_radius, updated_at = NOW() WHERE id = v_dispatch.id;
  END IF;

  SELECT w.id, wl.latitude, wl.longitude INTO v_next_worker
  FROM public.workers w
  LEFT JOIN public.worker_locations wl ON wl.worker_id = w.id
  INNER JOIN public.worker_availability wa ON wa.worker_id = w.id
  WHERE w.status = 'approved' AND w.category = v_booking.category AND wa.status = 'online'
    AND (w.city_id = v_booking.city_id OR wl.city_id = v_booking.city_id)
    AND w.id NOT IN (SELECT da.worker_id FROM public.dispatch_attempts da WHERE da.dispatch_request_id = v_dispatch.id)
    AND ((v_booking.latitude IS NOT NULL AND wl.latitude IS NOT NULL
          AND public.calculate_distance_m(v_booking.latitude, v_booking.longitude, wl.latitude, wl.longitude) <= v_new_radius * 1000)
         OR v_booking.latitude IS NULL)
  ORDER BY CASE WHEN wl.latitude IS NOT NULL AND v_booking.latitude IS NOT NULL
    THEN public.calculate_distance_m(v_booking.latitude, v_booking.longitude, wl.latitude, wl.longitude) ELSE 99999999 END ASC, w.rating_avg DESC
  LIMIT 1;

  IF v_next_worker IS NULL THEN
    SELECT w.id INTO v_next_worker FROM public.workers w INNER JOIN public.worker_availability wa ON wa.worker_id = w.id
    WHERE w.status = 'approved' AND w.category = v_booking.category AND wa.status = 'online' AND w.city_id = v_booking.city_id
      AND w.id NOT IN (SELECT da.worker_id FROM public.dispatch_attempts da WHERE da.dispatch_request_id = v_dispatch.id)
    ORDER BY w.rating_avg DESC LIMIT 1;
    IF v_next_worker IS NULL THEN
      RETURN jsonb_build_object('success', true, 'action', 'waiting', 'message', 'No additional workers found right now');
    END IF;
  END IF;

  INSERT INTO public.dispatch_attempts (dispatch_request_id, worker_id, status, sent_at, response_window_seconds)
  VALUES (v_dispatch.id, v_next_worker.id, 'sent', NOW(), v_config_window)
  ON CONFLICT (dispatch_request_id, worker_id) DO NOTHING;

  INSERT INTO public.notifications (user_id, type, title, content, link_url, metadata, is_read)
  VALUES (v_next_worker.id, 'booking_request', 'New Job Available!',
    'A new ' || v_booking.category || ' job is available near you.', '/partner/jobs',
    jsonb_build_object('booking_id', p_booking_id, 'response_window_seconds', v_config_window, 'sent_at', NOW()), FALSE);

  UPDATE public.dispatch_requests SET current_worker_id = v_next_worker.id, last_dispatched_at = NOW(),
    next_dispatch_at = NOW() + (v_config_window || ' seconds')::INTERVAL, updated_at = NOW()
  WHERE id = v_dispatch.id;

  RETURN jsonb_build_object('success', true, 'action', 'redispatched', 'next_worker_id', v_next_worker.id, 'attempt_number', v_dispatch.attempt_count + 1);

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- STEP 6: Fix get_nearby_dispatch_workers (no w.city_id reference)
CREATE OR REPLACE FUNCTION public.get_nearby_dispatch_workers(
  p_latitude NUMERIC, p_longitude NUMERIC, p_category TEXT, p_radius_km NUMERIC, p_limit INTEGER
)
RETURNS TABLE (worker_id UUID, distance_km NUMERIC, rating_avg NUMERIC, review_count INTEGER, latitude NUMERIC, longitude NUMERIC) AS $$
BEGIN
  RETURN QUERY
  SELECT w.id AS worker_id,
    (6371 * acos(LEAST(1.0, GREATEST(-1.0,
      cos(radians(p_latitude)) * cos(radians(wl.latitude)) * cos(radians(wl.longitude) - radians(p_longitude)) +
      sin(radians(p_latitude)) * sin(radians(wl.latitude))))))::numeric AS distance_km,
    w.rating_avg, w.review_count, wl.latitude, wl.longitude
  FROM public.workers w
  JOIN public.worker_locations wl ON wl.worker_id = w.id
  JOIN public.worker_availability wa ON wa.worker_id = w.id
  WHERE w.status = 'approved' AND w.category = p_category AND wa.status = 'online'
    AND wl.latitude IS NOT NULL AND wl.longitude IS NOT NULL
    AND (6371 * acos(LEAST(1.0, GREATEST(-1.0,
      cos(radians(p_latitude)) * cos(radians(wl.latitude)) * cos(radians(wl.longitude) - radians(p_longitude)) +
      sin(radians(p_latitude)) * sin(radians(wl.latitude)))))) <= p_radius_km
  ORDER BY distance_km ASC, w.rating_avg DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── VERIFICATION ──────────────────────────────────────────────
SELECT column_name FROM information_schema.columns WHERE table_name='workers' AND column_name='city_id';
-- Expected: 1 row (city_id)

SELECT status, count(*) FROM workers GROUP BY status;
-- Expected: shows 'approved' workers

SELECT city_id, count(*) FROM workers GROUP BY city_id;
-- Expected: rows with a city UUID (not null)
