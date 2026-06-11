-- ============================================================
-- Zolvo Production Performance & Concurrency Optimizations Migration
-- ============================================================

-- 1. Database Indexes for Query Optimization
CREATE INDEX IF NOT EXISTS idx_bookings_client_id ON public.bookings(client_id);
CREATE INDEX IF NOT EXISTS idx_bookings_worker_id ON public.bookings(worker_id);
CREATE INDEX IF NOT EXISTS idx_bookings_city_id ON public.bookings(city_id);
CREATE INDEX IF NOT EXISTS idx_bookings_area_id ON public.bookings(area_id);
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_type ON public.wallet_transactions(type);
CREATE INDEX IF NOT EXISTS idx_dispatch_attempts_worker_status ON public.dispatch_attempts(worker_id, status);
CREATE INDEX IF NOT EXISTS idx_worker_locations_coords ON public.worker_locations(latitude, longitude);
CREATE INDEX IF NOT EXISTS idx_cities_is_active ON public.cities(is_active);

-- 2. Atomic RPC function: Create Booking & Dispatch (reduces 11 roundtrips to 1)
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

-- 3. Atomic RPC function: Check and Expand Dispatch (prevents dirty reads/writes in polling)
CREATE OR REPLACE FUNCTION public.check_and_expand_dispatch(p_booking_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_booking RECORD;
  v_dispatch RECORD;
  v_now TIMESTAMPTZ := NOW();
  v_elapsed_seconds NUMERIC;
  v_last_update_seconds NUMERIC;
  v_next_radius NUMERIC;
  v_notified_count INTEGER;
  v_notified_ids UUID[];
  v_worker RECORD;
  v_new_workers_count INTEGER := 0;
BEGIN
  -- Lock dispatch request row FOR UPDATE to prevent concurrency race conditions
  SELECT * INTO v_dispatch
  FROM public.dispatch_requests d
  WHERE d.booking_id = p_booking_id
  FOR UPDATE;

  IF NOT FOUND THEN
    SELECT * INTO v_booking FROM public.bookings WHERE id = p_booking_id;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('success', false, 'error', 'Booking not found');
    END IF;

    INSERT INTO public.dispatch_requests (booking_id, status, max_radius_km, current_radius_km, created_at, updated_at)
    VALUES (p_booking_id, 'searching', 15.0, 5.0, NOW(), NOW())
    RETURNING * INTO v_dispatch;
  END IF;

  SELECT * INTO v_booking FROM public.bookings WHERE id = p_booking_id;

  IF v_dispatch.status != 'searching' OR v_booking.status != 'broadcasting' THEN
    RETURN jsonb_build_object(
      'success', true,
      'status', v_dispatch.status,
      'booking', row_to_json(v_booking),
      'dispatch', row_to_json(v_dispatch)
    );
  END IF;

  v_elapsed_seconds := EXTRACT(EPOCH FROM (v_now - v_dispatch.created_at));
  v_last_update_seconds := EXTRACT(EPOCH FROM (v_now - v_dispatch.updated_at));

  -- Check overall timeout (150 seconds)
  IF v_elapsed_seconds > 150 THEN
    UPDATE public.dispatch_requests
    SET status = 'expired', updated_at = v_now
    WHERE id = v_dispatch.id
    RETURNING * INTO v_dispatch;

    UPDATE public.bookings
    SET status = 'cancelled', updated_at = v_now
    WHERE id = p_booking_id
    RETURNING * INTO v_booking;

    INSERT INTO public.booking_timeline (booking_id, status, reason, created_by)
    VALUES (p_booking_id, 'cancelled', 'Dispatch request timed out. No available professionals nearby.', v_booking.client_id);

    INSERT INTO public.notifications (user_id, type, title, content, link_url, metadata)
    SELECT 
      da.worker_id,
      'booking_request_cancelled',
      'Request Expired',
      'Booking request timed out without acceptance.',
      '',
      jsonb_build_object('booking_id', p_booking_id)
    FROM public.dispatch_attempts da
    WHERE da.dispatch_request_id = v_dispatch.id;

    RETURN jsonb_build_object(
      'success', true,
      'status', 'expired',
      'booking', row_to_json(v_booking),
      'dispatch', row_to_json(v_dispatch)
    );
  END IF;

  -- Check step timeout for radius expansion (30 seconds)
  IF v_last_update_seconds >= 30 AND v_dispatch.current_radius_km < v_dispatch.max_radius_km THEN
    v_next_radius := v_dispatch.current_radius_km + 5.0;

    UPDATE public.dispatch_requests
    SET current_radius_km = v_next_radius, updated_at = v_now
    WHERE id = v_dispatch.id
    RETURNING * INTO v_dispatch;

    IF v_booking.latitude IS NOT NULL AND v_booking.longitude IS NOT NULL THEN
      SELECT COALESCE(array_agg(worker_id), '{}'::uuid[]) INTO v_notified_ids
      FROM public.dispatch_attempts
      WHERE dispatch_request_id = v_dispatch.id;

      FOR v_worker IN 
        SELECT * FROM get_nearby_dispatch_workers(v_booking.latitude, v_booking.longitude, v_booking.category, v_next_radius, 10)
      LOOP
        IF NOT (v_worker.worker_id = ANY(v_notified_ids)) THEN
          INSERT INTO public.dispatch_attempts (dispatch_request_id, worker_id, status)
          VALUES (v_dispatch.id, v_worker.worker_id, 'sent')
          ON CONFLICT (dispatch_request_id, worker_id) DO NOTHING;

          INSERT INTO public.notifications (user_id, type, title, content, link_url, metadata)
          VALUES (
            v_worker.worker_id,
            'booking_request',
            'New Service Request Nearby (Expanded)',
            v_booking.category || ' - ' || v_booking.description || '. Tap to accept.',
            '/worker/dashboard',
            jsonb_build_object(
              'booking_id', v_booking.id,
              'category', v_booking.category,
              'description', v_booking.description,
              'expires_at', v_booking.expires_at,
              'distance_km', ROUND(v_worker.distance_km, 1)::TEXT,
              'priority', 'medium'
            )
          );
          v_new_workers_count := v_new_workers_count + 1;
        END IF;
      END LOOP;

      IF v_new_workers_count > 0 THEN
        UPDATE public.bookings
        SET notified_worker_count = COALESCE(notified_worker_count, 0) + v_new_workers_count,
            updated_at = v_now
        WHERE id = p_booking_id
        RETURNING * INTO v_booking;
      END IF;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'status', 'searching',
    'booking', row_to_json(v_booking),
    'dispatch', row_to_json(v_dispatch),
    'time_left_seconds', GREATEST(0, FLOOR(150 - v_elapsed_seconds))
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Atomic RPC function: Top-Up Worker Wallet (prevents concurrency balance errors)
CREATE OR REPLACE FUNCTION public.topup_worker_wallet(
  p_worker_id UUID,
  p_amount NUMERIC,
  p_description TEXT
)
RETURNS JSONB AS $$
DECLARE
  v_wallet RECORD;
  v_new_balance NUMERIC;
BEGIN
  -- Lock the wallet row to prevent concurrent adjustments
  SELECT * INTO v_wallet
  FROM public.worker_wallets
  WHERE worker_id = p_worker_id
  FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.worker_wallets (worker_id, balance, currency, updated_at)
    VALUES (p_worker_id, p_amount, 'INR', NOW())
    RETURNING * INTO v_wallet;
    v_new_balance := p_amount;
  ELSE
    v_new_balance := v_wallet.balance + p_amount;
    UPDATE public.worker_wallets
    SET balance = v_new_balance, updated_at = NOW()
    WHERE worker_id = p_worker_id;
  END IF;

  -- Insert recharge transaction ledger
  INSERT INTO public.wallet_transactions (worker_id, type, amount, balance_after, description)
  VALUES (p_worker_id, 'recharge', p_amount, v_new_balance, p_description);

  RETURN jsonb_build_object(
    'success', true,
    'balance', v_new_balance,
    'worker_id', p_worker_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
