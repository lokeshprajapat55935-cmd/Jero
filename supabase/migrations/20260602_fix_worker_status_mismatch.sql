-- ============================================================
-- Zolvo Architecture Hardening & Alignment Migration
-- ============================================================

-- 1. Fix w.status RLS policies on bookings
DROP POLICY IF EXISTS "Workers can view assigned or broadcasting bookings" ON public.bookings;
CREATE POLICY "Workers can view assigned or broadcasting bookings" ON public.bookings
  FOR SELECT USING (
    auth.uid() = worker_id OR
    (
      EXISTS (
        SELECT 1 FROM public.workers w
        WHERE w.id = auth.uid()
        AND w.category = bookings.category
        AND w.status = 'approved' -- ALIGNED: check approved instead of active
      )
      AND status = 'broadcasting'
    )
  );

DROP POLICY IF EXISTS "Participants and eligible workers can update bookings" ON public.bookings;
CREATE POLICY "Participants and eligible workers can update bookings" ON public.bookings
  FOR UPDATE USING (
    auth.uid() = client_id OR
    auth.uid() = worker_id OR
    (
      EXISTS (
        SELECT 1 FROM public.workers w
        WHERE w.id = auth.uid()
        AND w.category = bookings.category
        AND w.status = 'approved' -- ALIGNED: check approved instead of active
      )
      AND worker_id IS NULL
      AND status = 'broadcasting'
    )
  );

-- 2. Update get_nearby_dispatch_workers to check status = 'approved'
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
  WHERE w.status = 'approved' -- FIXED: check approved instead of active
    AND w.category = p_category
    AND wa.status = 'available'
    AND wl.latitude IS NOT NULL
    AND wl.longitude IS NOT NULL
    AND wl.last_active_at >= NOW() - INTERVAL '15 minutes'
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

-- 3. Update accept_dispatch_booking to check status = 'approved'
CREATE OR REPLACE FUNCTION public.accept_dispatch_booking(p_booking_id UUID, p_worker_id UUID)
RETURNS public.bookings AS $$
DECLARE
  v_booking public.bookings;
  v_now TIMESTAMPTZ := NOW();
BEGIN
  -- 1. Check if worker is active & approved
  IF NOT EXISTS (
    SELECT 1 FROM public.workers 
    WHERE id = p_worker_id AND status = 'approved' -- FIXED: approved status
  ) THEN
    RAISE EXCEPTION 'Only active professionals can accept bookings';
  END IF;

  -- 2. Check if worker already has an active booking (Active Booking Lock)
  IF EXISTS (
    SELECT 1 FROM public.active_bookings 
    WHERE worker_id = p_worker_id
  ) THEN
    RAISE EXCEPTION 'You already have an active booking';
  END IF;

  -- 3. Lock the booking and update it if it's broadcasting and worker_id is null
  UPDATE public.bookings
  SET worker_id = p_worker_id,
      status = 'accepted',
      updated_at = v_now
  WHERE id = p_booking_id
    AND worker_id IS NULL
    AND status = 'broadcasting'
    AND expires_at > v_now
  RETURNING * INTO v_booking;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking is no longer available or has been accepted by someone else';
  END IF;

  -- 4. Insert into active_bookings (atomically locking the worker from other dispatches)
  INSERT INTO public.active_bookings (booking_id, worker_id, client_id, status)
  VALUES (v_booking.id, p_worker_id, v_booking.client_id, 'accepted');

  -- 5. Update worker availability status to busy
  INSERT INTO public.worker_availability (worker_id, status, last_active_at, current_booking_id)
  VALUES (p_worker_id, 'busy', v_now, v_booking.id)
  ON CONFLICT (worker_id) 
  DO UPDATE SET status = 'busy', last_active_at = v_now, current_booking_id = v_booking.id;

  -- 6. Update dispatch request to accepted
  UPDATE public.dispatch_requests
  SET status = 'accepted', updated_at = v_now
  WHERE booking_id = p_booking_id;

  RETURN v_booking;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Update create_booking_dispatch fallback to check status = 'approved'
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
  ELSIF p_category = 'Labour' THEN
    IF p_description = 'Loading/Unloading (per hour)' THEN v_base_service_charge := 300;
    ELSIF p_description = 'House Shifting Help (half day)' THEN v_base_service_charge := 800;
    ELSIF p_description = 'Heavy Lifting (single task)' THEN v_base_service_charge := 400;
    ELSIF p_description = 'Cleaning/Sweeping (per hour)' THEN v_base_service_charge := 250;
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
      WHERE w.status = 'approved' -- FIXED: check approved instead of active
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

-- 5. Harden state transitions: Block cancellations from awaiting_payment status
CREATE OR REPLACE FUNCTION public.validate_booking_state_transition()
RETURNS TRIGGER AS $$
DECLARE
  v_worker_lat NUMERIC;
  v_worker_lng NUMERIC;
  v_distance_m NUMERIC;
  v_cancel_count INTEGER;
  v_cancellation_threshold INTEGER;
BEGIN
  -- Validate state changes
  -- Allowed states: pending, broadcasting, accepted, arrived, in_progress, awaiting_otp, otp_verified, awaiting_payment, completed, paid_completed
  
  -- Prevent skipping booking states and check state transitions
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF OLD.status = 'pending' AND NEW.status NOT IN ('broadcasting', 'cancelled') THEN
      RAISE EXCEPTION 'Invalid transition from pending to %', NEW.status;
    ELSIF OLD.status = 'broadcasting' AND NEW.status NOT IN ('accepted', 'cancelled') THEN
      RAISE EXCEPTION 'Invalid transition from broadcasting to %', NEW.status;
    ELSIF OLD.status = 'accepted' AND NEW.status NOT IN ('arrived', 'cancelled') THEN
      RAISE EXCEPTION 'Invalid transition from accepted to %', NEW.status;
    ELSIF OLD.status = 'arrived' AND NEW.status NOT IN ('in_progress', 'cancelled') THEN
      RAISE EXCEPTION 'Invalid transition from arrived to %', NEW.status;
    ELSIF OLD.status = 'in_progress' AND NEW.status NOT IN ('awaiting_otp', 'cancelled') THEN
      RAISE EXCEPTION 'Invalid transition from in_progress to %', NEW.status;
    ELSIF OLD.status = 'awaiting_otp' AND NEW.status NOT IN ('otp_verified', 'disputed') THEN
      RAISE EXCEPTION 'Invalid transition from awaiting_otp to %', NEW.status;
    ELSIF OLD.status = 'otp_verified' AND NEW.status NOT IN ('awaiting_payment', 'completed', 'paid_completed') THEN
      RAISE EXCEPTION 'Invalid transition from otp_verified to %', NEW.status;
    ELSIF OLD.status = 'awaiting_payment' AND NEW.status NOT IN ('completed', 'paid_completed', 'payment_processing', 'disputed') THEN -- FIXED: removed 'cancelled', added 'payment_processing'
      RAISE EXCEPTION 'Invalid transition from awaiting_payment to % (OTP is already verified, payment is required)', NEW.status;
    ELSIF OLD.status = 'completed' AND NEW.status NOT IN ('paid_completed') THEN
      RAISE EXCEPTION 'Invalid transition from completed to %', NEW.status;
    ELSIF OLD.status = 'paid_completed' THEN
      RAISE EXCEPTION 'Booking is already finalized as paid_completed';
    ELSIF OLD.status = 'cancelled' THEN
      RAISE EXCEPTION 'Cannot modify state of a cancelled booking';
    END IF;
  END IF;

  -- GPS Fraud Check: verify worker is close to client on status update (arrived, in_progress, awaiting_otp)
  IF NEW.status IN ('arrived', 'in_progress', 'awaiting_otp') AND NEW.worker_id IS NOT NULL AND (OLD.status IS DISTINCT FROM NEW.status) THEN
    SELECT latitude, longitude INTO v_worker_lat, v_worker_lng
    FROM public.worker_locations
    WHERE worker_id = NEW.worker_id;

    IF v_worker_lat IS NOT NULL AND v_worker_lng IS NOT NULL AND NEW.latitude IS NOT NULL AND NEW.longitude IS NOT NULL THEN
      v_distance_m := calculate_distance_m(v_worker_lat, v_worker_lng, NEW.latitude, NEW.longitude);
      
      IF v_distance_m > 1000 THEN
        -- Log fraud flag
        INSERT INTO public.fraud_flags (user_id, flag_type, severity, status, description, booking_id, evidence)
        VALUES (
          NEW.worker_id,
          'wallet_abuse',
          'high',
          'open',
          'Attempted ' || NEW.status || ' status update while being ' || ROUND(v_distance_m, 0) || ' meters away.',
          NEW.id,
          jsonb_build_object('distance_m', v_distance_m, 'worker_lat', v_worker_lat, 'worker_lng', v_worker_lng, 'booking_lat', NEW.latitude, 'booking_lng', NEW.longitude)
        );
        
        RAISE EXCEPTION 'Worker is too far from the booking location to update status (Distance: %m).', ROUND(v_distance_m, 0);
      END IF;
    END IF;
  END IF;

  -- Cancellation rate fraud checks (suspicious cancellations tracker)
  IF NEW.status = 'cancelled' AND OLD.status != 'cancelled' THEN
    -- Get client/worker cancellation limits
    SELECT value::INTEGER INTO v_cancellation_threshold
    FROM public.platform_config
    WHERE key = 'fraud_cancellation_threshold' LIMIT 1;
    
    v_cancellation_threshold := COALESCE(v_cancellation_threshold, 5);

    -- Count cancellations in past 7 days for the client
    SELECT COUNT(*) INTO v_cancel_count
    FROM public.bookings
    WHERE client_id = NEW.client_id
      AND status = 'cancelled'
      AND updated_at >= NOW() - INTERVAL '7 days';

    IF v_cancel_count >= v_cancellation_threshold THEN
      INSERT INTO public.fraud_flags (user_id, flag_type, severity, status, description, booking_id, evidence)
      VALUES (
        NEW.client_id,
        'suspicious_cancellation',
        'medium',
        'open',
        'Client has cancelled ' || (v_cancel_count + 1) || ' bookings in the last 7 days.',
        NEW.id,
        jsonb_build_object('cancel_count_7d', v_cancel_count + 1)
      );
    END IF;

    -- Count cancellations in past 7 days for worker if assigned
    IF NEW.worker_id IS NOT NULL THEN
      SELECT COUNT(*) INTO v_cancel_count
      FROM public.bookings
      WHERE worker_id = NEW.worker_id
        AND status = 'cancelled'
        AND updated_at >= NOW() - INTERVAL '7 days';

      IF v_cancel_count >= v_cancellation_threshold THEN
        INSERT INTO public.fraud_flags (user_id, flag_type, severity, status, description, booking_id, evidence)
        VALUES (
          NEW.worker_id,
          'suspicious_cancellation',
          'medium',
          'open',
          'Worker has cancelled ' || (v_cancel_count + 1) || ' bookings in the last 7 days.',
          NEW.id,
          jsonb_build_object('cancel_count_7d', v_cancel_count + 1)
        );
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
