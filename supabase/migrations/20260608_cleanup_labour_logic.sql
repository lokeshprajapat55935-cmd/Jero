-- Migration: 20260608_cleanup_labour_logic.sql
-- Removes the 'labour' service category and cleans up associated pricing logic.

-- 1. Remove 'labour' category from public.service_categories
DELETE FROM public.service_categories WHERE id = 'labour';

-- 2. Update create_booking_dispatch to remove the 'Labour' pricing determination
CREATE OR REPLACE FUNCTION public.create_booking_dispatch(
  p_client_id UUID,
  p_category TEXT,
  p_description TEXT,
  p_location_address TEXT,
  p_latitude NUMERIC,
  p_longitude NUMERIC,
  p_area_id UUID,
  p_payment_method TEXT,
  p_ip_address TEXT,
  p_user_agent TEXT
)
RETURNS JSONB AS $$
DECLARE
  v_limit_allowed BOOLEAN;
  v_client_city_id UUID;
  v_client_area_id UUID;
  v_base_service_charge NUMERIC;
  v_discount_amount NUMERIC;
  v_total_price NUMERIC;
  v_expires_at TIMESTAMPTZ;
  v_duplicate RECORD;
  v_booking RECORD;
  v_dispatch RECORD;
  v_profile RECORD;
  v_notified_count INTEGER := 0;
  v_worker RECORD;
BEGIN
  -- Rate Limiting Check using existing rate limiter
  SELECT check_rate_limit(
    'rate:booking:create:' || p_client_id::TEXT,
    3,
    600
  ) INTO v_limit_allowed;

  IF NOT v_limit_allowed THEN
    INSERT INTO public.security_logs (user_id, event_type, severity, description, ip_address, user_agent)
    VALUES (p_client_id, 'rate_limit_exceeded', 'medium', 'Booking creation rate limit exceeded', p_ip_address, p_user_agent);
    RETURN jsonb_build_object('success', false, 'error', 'Too many bookings created. Please wait 10 minutes.', 'code', 429);
  END IF;

  -- Session / Device Audit Log
  SELECT last_ip, last_user_agent INTO v_profile FROM public.profiles WHERE id = p_client_id;
  IF FOUND THEN
    IF v_profile.last_ip IS NOT NULL AND (v_profile.last_ip != p_ip_address OR v_profile.last_user_agent != p_user_agent) THEN
      INSERT INTO public.auth_audit_events (user_id, event_type, ip_address, user_agent, metadata)
      VALUES (p_client_id, 'device_changed', p_ip_address, p_user_agent, jsonb_build_object(
        'old_ip', v_profile.last_ip,
        'old_user_agent', v_profile.last_user_agent,
        'new_ip', p_ip_address,
        'new_user_agent', p_user_agent
      ));
    END IF;

    UPDATE public.profiles
    SET last_ip = p_ip_address,
        last_user_agent = p_user_agent,
        last_active_at = NOW()
    WHERE id = p_client_id;
  END IF;

  -- Check client onboarding
  SELECT city_id, area_id INTO v_client_city_id, v_client_area_id FROM public.clients WHERE id = p_client_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Complete client onboarding before booking.', 'code', 403);
  END IF;

  -- Duplicate Check
  SELECT id, status, expires_at INTO v_duplicate
  FROM public.bookings
  WHERE client_id = p_client_id
    AND status = 'broadcasting'
    AND expires_at > NOW()
  LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object('success', true, 'booking_id', v_duplicate.id, 'status', 'duplicate');
  END IF;

  -- Pricing Determination
  IF p_category = 'Electrician' THEN
    IF p_description = 'Fan Repair' THEN v_base_service_charge := 250;
    ELSIF p_description = 'Switchboard Installation' THEN v_base_service_charge := 350;
    ELSIF p_description = 'Short Circuit Inspection' THEN v_base_service_charge := 400;
    ELSIF p_description = 'Inverter Repair/Service' THEN v_base_service_charge := 600;
    ELSE v_base_service_charge := 250;
    END IF;
  ELSIF p_category = 'Plumber' THEN
    IF p_description = 'Tap/Fitted Leakage' THEN v_base_service_charge := 200;
    ELSIF p_description = 'Toilet Flush Repair' THEN v_base_service_charge := 300;
    ELSIF p_description = 'Washbasin Installation' THEN v_base_service_charge := 450;
    ELSIF p_description = 'Water Tank Cleaning' THEN v_base_service_charge := 800;
    ELSE v_base_service_charge := 250;
    END IF;
  ELSE
    v_base_service_charge := 250;
  END IF;

  -- Apply 5% discount for online payments (upi, card)
  IF p_payment_method IN ('upi', 'card') THEN
    v_discount_amount := ROUND(v_base_service_charge * 0.05, 0);
  ELSE
    v_discount_amount := 0;
  END IF;
  v_total_price := v_base_service_charge - v_discount_amount;

  -- Setup defaults
  IF v_client_city_id IS NULL THEN
    SELECT c.id INTO v_client_city_id
    FROM public.cities c
    WHERE c.slug = (SELECT value FROM public.platform_config WHERE key = 'active_city_slug' LIMIT 1)
    LIMIT 1;
  END IF;

  IF p_area_id IS NULL THEN
    p_area_id := v_client_area_id;
  END IF;

  v_expires_at := NOW() + INTERVAL '5 minutes';

  -- Insert Booking
  INSERT INTO public.bookings (
    client_id, worker_id, status, category, description, total_price,
    base_service_charge, service_charge, material_charge, discount_amount,
    commission_deducted, visit_charge, scheduled_at, city_id, area_id,
    location_address, latitude, longitude, expires_at, payment_method,
    payment_status, payment_locked
  ) VALUES (
    p_client_id, NULL, 'broadcasting', p_category, p_description, v_total_price,
    v_base_service_charge, v_base_service_charge, 0, v_discount_amount,
    FALSE, 0, NOW(), v_client_city_id, p_area_id,
    p_location_address, p_latitude, p_longitude, v_expires_at, p_payment_method,
    'pending', TRUE
  )
  RETURNING * INTO v_booking;

  -- Booking Timeline
  INSERT INTO public.booking_timeline (booking_id, status, reason, created_by)
  VALUES (v_booking.id, 'broadcasting', 'Dispatch request created, broadcasting to nearby workers', p_client_id);

  -- Dispatch Request
  INSERT INTO public.dispatch_requests (booking_id, status, max_radius_km, current_radius_km)
  VALUES (v_booking.id, 'searching', 15.0, 5.0)
  RETURNING * INTO v_dispatch;

  -- Query nearby workers & insert attempts/notifications
  IF p_latitude IS NOT NULL AND p_longitude IS NOT NULL THEN
    FOR v_worker IN 
      SELECT * FROM get_nearby_dispatch_workers(p_latitude, p_longitude, p_category, 5.0, 15)
    LOOP
      INSERT INTO public.dispatch_attempts (dispatch_request_id, worker_id, status)
      VALUES (v_dispatch.id, v_worker.worker_id, 'sent')
      ON CONFLICT (dispatch_request_id, worker_id) DO NOTHING;

      INSERT INTO public.notifications (user_id, type, title, content, link_url, metadata)
      VALUES (
        v_worker.worker_id,
        'booking_request',
        'New Service Request Nearby',
        p_category || ' - ' || p_description || '. Tap to accept.',
        '/worker/dashboard',
        jsonb_build_object(
          'booking_id', v_booking.id,
          'category', p_category,
          'description', p_description,
          'expires_at', v_expires_at,
          'distance_km', ROUND(v_worker.distance_km, 1)::TEXT,
          'priority', 'high'
        )
      );
      v_notified_count := v_notified_count + 1;
    END LOOP;
  ELSE
    -- Fallback base area matching
    FOR v_worker IN
      SELECT w.id AS worker_id FROM public.workers w
      JOIN public.worker_availability wa ON wa.worker_id = w.id
      WHERE w.status = 'active'
        AND w.category = p_category
        AND wa.status = 'available'
        AND w.id != p_client_id
        AND (w.city_id = v_client_city_id OR w.city_id IS NULL)
        AND (w.area_id = p_area_id OR w.area_id IS NULL)
      LIMIT 15
    LOOP
      INSERT INTO public.dispatch_attempts (dispatch_request_id, worker_id, status)
      VALUES (v_dispatch.id, v_worker.worker_id, 'sent')
      ON CONFLICT (dispatch_request_id, worker_id) DO NOTHING;

      INSERT INTO public.notifications (user_id, type, title, content, link_url, metadata)
      VALUES (
        v_worker.worker_id,
        'booking_request',
        'New Service Request Nearby',
        p_category || ' - ' || p_description || '. Tap to accept.',
        '/worker/dashboard',
        jsonb_build_object(
          'booking_id', v_booking.id,
          'category', p_category,
          'description', p_description,
          'expires_at', v_expires_at,
          'priority', 'high'
        )
      );
      v_notified_count := v_notified_count + 1;
    END LOOP;
  END IF;

  UPDATE public.bookings
  SET notified_worker_count = v_notified_count
  WHERE id = v_booking.id;

  RETURN jsonb_build_object(
    'success', true,
    'booking_id', v_booking.id,
    'notified_worker_count', v_notified_count,
    'status', 'created'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
