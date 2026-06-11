-- ============================================================
-- Zolvo Security Hardening Migration V2
-- Hardens state engine, wallet online limits, GPS validation,
-- OTP brute forcing, and audit logging tables.
-- ============================================================

-- 1. Drop plain text otp_code from public.bookings (move strictly to in-memory decryption)
ALTER TABLE public.bookings DROP COLUMN IF EXISTS otp_code;

-- 2. Add Session/Device Tracking Columns to Profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS last_ip TEXT,
  ADD COLUMN IF NOT EXISTS last_user_agent TEXT,
  ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMPTZ;

-- 3. Create Audit & Logging Tables
CREATE TABLE IF NOT EXISTS public.security_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL, -- e.g. 'brute_force_attempt', 'unauthorized_access', 'gps_spoof_attempt', 'rate_limit_exceeded'
  severity TEXT NOT NULL CHECK (severity IN ('info', 'low', 'medium', 'high', 'critical')),
  description TEXT NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.auth_audit_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL, -- 'login_success', 'login_failed', 'session_hijack', 'device_changed'
  ip_address TEXT,
  user_agent TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.payment_verifications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  booking_id UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  transaction_id UUID REFERENCES public.payment_transactions(id) ON DELETE SET NULL,
  payment_method TEXT NOT NULL,
  reference_id TEXT UNIQUE,
  status TEXT NOT NULL CHECK (status IN ('pending', 'verified', 'failed')),
  verification_notes TEXT,
  verified_by UUID REFERENCES public.profiles(id), -- NULL if automatic
  verified_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.booking_audit_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  booking_id UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  actor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  action TEXT NOT NULL, -- 'create', 'status_change', 'update'
  old_status TEXT,
  new_status TEXT,
  notes TEXT,
  ip_address TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.rate_limits (
  key TEXT PRIMARY KEY,
  hits INTEGER NOT NULL DEFAULT 1,
  expires_at TIMESTAMPTZ NOT NULL
);

-- Enable RLS
ALTER TABLE public.security_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auth_audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_verifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booking_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;

-- RLS Policies
DROP POLICY IF EXISTS "Admins can view security logs" ON public.security_logs;
CREATE POLICY "Admins can view security logs" ON public.security_logs
  FOR SELECT USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "Admins can view auth audit events" ON public.auth_audit_events;
CREATE POLICY "Admins can view auth audit events" ON public.auth_audit_events
  FOR SELECT USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "Users can view own auth audit events" ON public.auth_audit_events;
CREATE POLICY "Users can view own auth audit events" ON public.auth_audit_events
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Admins can manage payment verifications" ON public.payment_verifications;
CREATE POLICY "Admins can manage payment verifications" ON public.payment_verifications
  FOR ALL USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "Users can view own payment verifications" ON public.payment_verifications;
CREATE POLICY "Users can view own payment verifications" ON public.payment_verifications
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.bookings b
      WHERE b.id = booking_id AND (b.client_id = auth.uid() OR b.worker_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "Admins can view booking audit logs" ON public.booking_audit_logs;
CREATE POLICY "Admins can view booking audit logs" ON public.booking_audit_logs
  FOR SELECT USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "Users can view own booking audit logs" ON public.booking_audit_logs;
CREATE POLICY "Users can view own booking audit logs" ON public.booking_audit_logs
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.bookings b
      WHERE b.id = booking_id AND (b.client_id = auth.uid() OR b.worker_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "Admins can view rate limits" ON public.rate_limits;
CREATE POLICY "Admins can view rate limits" ON public.rate_limits
  FOR SELECT USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_security_logs_user ON public.security_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_auth_audit_events_user ON public.auth_audit_events(user_id);
CREATE INDEX IF NOT EXISTS idx_payment_verifications_booking ON public.payment_verifications(booking_id);
CREATE INDEX IF NOT EXISTS idx_booking_audit_logs_booking ON public.booking_audit_logs(booking_id);
CREATE INDEX IF NOT EXISTS idx_rate_limits_expiry ON public.rate_limits(expires_at);

-- 4. Atomic Rate Limiting SQL Function
CREATE OR REPLACE FUNCTION public.check_rate_limit(
  p_key TEXT,
  p_max_hits INTEGER,
  p_window_seconds INTEGER
)
RETURNS BOOLEAN AS $$
DECLARE
  v_limit RECORD;
  v_now TIMESTAMPTZ := NOW();
BEGIN
  -- Clean up expired
  DELETE FROM public.rate_limits WHERE expires_at < v_now;

  -- Select and lock
  SELECT * INTO v_limit
  FROM public.rate_limits
  WHERE key = p_key
  FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.rate_limits (key, hits, expires_at)
    VALUES (p_key, 1, v_now + (p_window_seconds || ' seconds')::INTERVAL);
    RETURN TRUE;
  END IF;

  IF v_limit.hits >= p_max_hits THEN
    RETURN FALSE;
  END IF;

  UPDATE public.rate_limits
  SET hits = v_limit.hits + 1
  WHERE key = p_key;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Distance Calculation SQL Function
CREATE OR REPLACE FUNCTION public.calculate_distance_m(
  lat1 NUMERIC, lon1 NUMERIC,
  lat2 NUMERIC, lon2 NUMERIC
) RETURNS NUMERIC AS $$
BEGIN
  IF lat1 IS NULL OR lon1 IS NULL OR lat2 IS NULL OR lon2 IS NULL THEN
    RETURN 0;
  END IF;
  -- Haversine formula
  RETURN (6371000 * acos(
    cos(radians(lat1)) * cos(radians(lat2)) * 
    cos(radians(lon2) - radians(lon1)) + 
    sin(radians(lat1)) * sin(radians(lat2))
  ))::numeric;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- 6. Atomic OTP Verification SQL Function
CREATE OR REPLACE FUNCTION public.verify_booking_otp(
  p_booking_id UUID,
  p_otp_hash TEXT,
  p_user_id UUID
)
RETURNS JSONB AS $$
DECLARE
  v_booking RECORD;
  v_now TIMESTAMPTZ := NOW();
  v_attempts INTEGER;
  v_max_attempts INTEGER := 5;
BEGIN
  -- Fetch and lock the booking
  SELECT * INTO v_booking
  FROM public.bookings
  WHERE id = p_booking_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'reason', 'Booking not found', 'code', 404);
  END IF;

  -- Verify access
  IF v_booking.client_id != p_user_id AND v_booking.worker_id != p_user_id THEN
    RETURN jsonb_build_object('success', false, 'reason', 'Forbidden', 'code', 403);
  END IF;

  -- Enforce state
  IF v_booking.status != 'awaiting_otp' THEN
    RETURN jsonb_build_object('success', false, 'reason', 'Booking is not awaiting OTP verification', 'code', 400);
  END IF;

  -- Check if already used
  IF v_booking.otp_used THEN
    RETURN jsonb_build_object('success', false, 'reason', 'OTP has already been used', 'code', 400);
  END IF;

  -- Check expiry
  IF v_booking.otp_expires_at IS NOT NULL AND v_booking.otp_expires_at < v_now THEN
    RETURN jsonb_build_object('success', false, 'reason', 'OTP has expired', 'code', 400);
  END IF;

  -- Check attempts limit
  IF COALESCE(v_booking.otp_attempts, 0) >= v_max_attempts THEN
    RETURN jsonb_build_object('success', false, 'reason', 'Too many failed attempts. Verification locked', 'code', 400);
  END IF;

  -- Check hash
  IF v_booking.otp_hash != p_otp_hash THEN
    v_attempts := COALESCE(v_booking.otp_attempts, 0) + 1;
    
    IF v_attempts >= v_max_attempts THEN
      -- Automatically lock and dispute the booking
      UPDATE public.bookings
      SET status = 'disputed',
          otp_attempts = v_attempts,
          updated_at = v_now
      WHERE id = p_booking_id;
      
      -- Create dispute record
      INSERT INTO public.disputes (booking_id, raised_by, dispute_type, status, title, description, priority)
      VALUES (
        p_booking_id,
        v_booking.client_id,
        'otp_issue',
        'open',
        'OTP Verification Lockout',
        'Booking automatically disputed due to 5 failed OTP attempts.',
        'medium'
      );
      
      -- Add to booking timeline
      INSERT INTO public.booking_timeline (booking_id, status, reason, created_by)
      VALUES (p_booking_id, 'disputed', 'OTP verification failed 5 times. Booking automatically marked as disputed.', p_user_id);
      
      -- Add fraud flag (flag the worker as OTP guessing can be an exploit attempt)
      INSERT INTO public.fraud_flags (user_id, flag_type, severity, status, description, booking_id, evidence)
      VALUES (
        v_booking.worker_id,
        'otp_failure_pattern',
        'medium',
        'open',
        'OTP verification failed 5 times for booking #' || p_booking_id,
        p_booking_id,
        jsonb_build_object('attempts', v_attempts)
      );

      -- Log security event
      INSERT INTO public.security_logs (user_id, event_type, severity, description, metadata)
      VALUES (
        p_user_id,
        'brute_force_attempt',
        'high',
        'Booking #' || p_booking_id || ' OTP brute forced: locked and disputed.',
        jsonb_build_object('attempts', v_attempts)
      );

      RETURN jsonb_build_object('success', false, 'reason', 'Too many failed attempts. Booking marked as disputed', 'code', 400, 'locked', true);
    ELSE
      -- Increment attempts
      UPDATE public.bookings
      SET otp_attempts = v_attempts,
          updated_at = v_now
      WHERE id = p_booking_id;

      INSERT INTO public.booking_timeline (booking_id, status, reason, created_by)
      VALUES (p_booking_id, 'awaiting_otp', 'Failed OTP attempt. Attempt ' || v_attempts || '/' || v_max_attempts, p_user_id);

      RETURN jsonb_build_object('success', false, 'reason', 'Invalid OTP code. ' || (v_max_attempts - v_attempts) || ' attempts remaining', 'code', 400, 'attempts_remaining', v_max_attempts - v_attempts);
    END IF;
  END IF;

  -- Success transition
  UPDATE public.bookings
  SET status = 'otp_verified',
      otp_used = true,
      otp_verified_at = v_now,
      updated_at = v_now
  WHERE id = p_booking_id;

  -- Transition immediately to awaiting_payment
  UPDATE public.bookings
  SET status = 'awaiting_payment',
      updated_at = v_now
  WHERE id = p_booking_id;

  INSERT INTO public.booking_timeline (booking_id, status, reason, created_by)
  VALUES (p_booking_id, 'awaiting_payment', 'OTP verified successfully. Work is verified. Awaiting payment confirmation.', p_user_id);

  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. Insert default configurations
INSERT INTO public.platform_config (key, value, description)
VALUES
  ('min_wallet_balance', '500', 'Minimum wallet balance required for worker to go online'),
  ('fraud_cancellation_threshold', '5', 'Cancellations in 7 days before fraud flag is raised')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

-- 8. Update admin_wallet_adjustment RPC (Add strict sub-role validation)
CREATE OR REPLACE FUNCTION public.admin_wallet_adjustment(
  p_worker_id UUID,
  p_amount NUMERIC,
  p_type TEXT, -- 'credit', 'debit', 'adjustment'
  p_description TEXT,
  p_admin_id UUID
)
RETURNS JSONB AS $$
DECLARE
  v_wallet RECORD;
  v_new_balance NUMERIC;
BEGIN
  -- Verify caller is admin and check sub-role
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = p_admin_id 
      AND role = 'admin' 
      AND admin_role IN ('super_admin', 'finance_admin')
  ) THEN
    RAISE EXCEPTION 'Unauthorized: Only Super Admin or Finance Admin can adjust wallets';
  END IF;

  IF p_type NOT IN ('credit', 'debit', 'adjustment') THEN
    RAISE EXCEPTION 'Invalid adjustment type: %', p_type;
  END IF;

  -- Lock wallet
  SELECT balance INTO v_wallet
  FROM public.worker_wallets
  WHERE worker_id = p_worker_id
  FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.worker_wallets (worker_id, balance, currency, updated_at)
    VALUES (p_worker_id, 0, 'INR', NOW());
    v_wallet.balance := 0;
  END IF;

  IF p_type = 'debit' THEN
    v_new_balance := v_wallet.balance - ABS(p_amount);
  ELSE
    v_new_balance := v_wallet.balance + ABS(p_amount);
  END IF;

  -- Update wallet
  UPDATE public.worker_wallets
  SET balance = v_new_balance,
      updated_at = NOW()
  WHERE worker_id = p_worker_id;

  -- Log transaction
  INSERT INTO public.wallet_transactions (
    worker_id, type, amount, balance_after, description, created_by
  ) VALUES (
    p_worker_id,
    p_type,
    ABS(p_amount),
    v_new_balance,
    p_description,
    p_admin_id
  );

  RETURN jsonb_build_object(
    'success', true,
    'type', p_type,
    'amount', ABS(p_amount),
    'new_balance', v_new_balance
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 9. Dispute Evidence dossier builder SQL Function
CREATE OR REPLACE FUNCTION public.get_booking_dispute_evidence(p_booking_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_booking JSONB;
  v_timeline JSONB;
  v_transactions JSONB;
  v_verifications JSONB;
  v_audit_logs JSONB;
  v_fraud_flags JSONB;
BEGIN
  SELECT row_to_json(b)::jsonb INTO v_booking
  FROM public.bookings b
  WHERE id = p_booking_id;

  IF v_booking IS NULL THEN
    RETURN jsonb_build_object('success', false, 'reason', 'Booking not found');
  END IF;

  SELECT coalesce(json_agg(t), '[]')::jsonb INTO v_timeline
  FROM public.booking_timeline t
  WHERE booking_id = p_booking_id
  ORDER BY created_at ASC;

  SELECT coalesce(json_agg(w), '[]')::jsonb INTO v_transactions
  FROM public.wallet_transactions w
  WHERE booking_id = p_booking_id
  ORDER BY created_at ASC;

  SELECT coalesce(json_agg(pv), '[]')::jsonb INTO v_verifications
  FROM public.payment_verifications pv
  WHERE booking_id = p_booking_id
  ORDER BY created_at ASC;

  SELECT coalesce(json_agg(al), '[]')::jsonb INTO v_audit_logs
  FROM public.booking_audit_logs al
  WHERE booking_id = p_booking_id
  ORDER BY created_at ASC;

  SELECT coalesce(json_agg(ff), '[]')::jsonb INTO v_fraud_flags
  FROM public.fraud_flags ff
  WHERE booking_id = p_booking_id
  ORDER BY created_at ASC;

  RETURN jsonb_build_object(
    'success', true,
    'booking', v_booking,
    'timeline', v_timeline,
    'wallet_transactions', v_transactions,
    'payment_verifications', v_verifications,
    'booking_audit_logs', v_audit_logs,
    'fraud_flags', v_fraud_flags
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 10. State Transition Trigger function (State sequence + distance + cancellations)
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
    ELSIF OLD.status = 'awaiting_payment' AND NEW.status NOT IN ('completed', 'paid_completed', 'cancelled', 'disputed') THEN
      RAISE EXCEPTION 'Invalid transition from awaiting_payment to %', NEW.status;
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

-- Safe trigger drop & creation
DROP TRIGGER IF EXISTS trigger_validate_booking_state_transition ON public.bookings;
CREATE TRIGGER trigger_validate_booking_state_transition
  BEFORE UPDATE OF status ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.validate_booking_state_transition();

-- 11. Worker online wallet check trigger function
CREATE OR REPLACE FUNCTION public.check_worker_online_wallet_balance()
RETURNS TRIGGER AS $$
DECLARE
  v_wallet_balance NUMERIC;
  v_min_balance NUMERIC;
BEGIN
  -- Only validate if status is transitioning to 'available' or 'online'
  IF NEW.status IN ('available', 'online') THEN
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

-- Safe trigger drop & creation
DROP TRIGGER IF EXISTS trigger_check_worker_online_wallet_balance ON public.worker_availability;
CREATE TRIGGER trigger_check_worker_online_wallet_balance
  BEFORE INSERT OR UPDATE OF status ON public.worker_availability
  FOR EACH ROW EXECUTE FUNCTION public.check_worker_online_wallet_balance();

-- 12. GPS spoofing trigger function
CREATE OR REPLACE FUNCTION public.check_gps_spoofing()
RETURNS TRIGGER AS $$
DECLARE
  v_time_diff NUMERIC;
  v_dist_km NUMERIC;
  v_speed_kmh NUMERIC;
BEGIN
  -- Only check if we have both old and new coords and time difference is valid
  IF OLD.latitude IS NOT NULL AND OLD.longitude IS NOT NULL AND NEW.latitude IS NOT NULL AND NEW.longitude IS NOT NULL THEN
    v_time_diff := EXTRACT(EPOCH FROM (NEW.last_active_at - OLD.last_active_at));
    
    IF v_time_diff > 5 THEN -- at least 5 seconds between updates
      -- Calculate distance in km
      v_dist_km := (6371 * acos(
        cos(radians(OLD.latitude)) * cos(radians(NEW.latitude)) * 
        cos(radians(NEW.longitude) - radians(OLD.longitude)) + 
        sin(radians(OLD.latitude)) * sin(radians(NEW.latitude))
      ))::numeric;
      
      -- Compute speed in km/h
      v_speed_kmh := (v_dist_km / (v_time_diff / 3600.0));
      
      -- If speed > 150 km/h and distance > 1km, log a fraud flag
      IF v_speed_kmh > 150.0 AND v_dist_km > 1.0 THEN
        INSERT INTO public.fraud_flags (user_id, flag_type, severity, status, description, evidence)
        VALUES (
          NEW.worker_id,
          'other',
          'high',
          'open',
          'Suspicious GPS speed: ' || ROUND(v_speed_kmh, 1) || ' km/h. Jumped ' || ROUND(v_dist_km, 2) || ' km in ' || ROUND(v_time_diff, 0) || ' seconds.',
          jsonb_build_object('speed_kmh', v_speed_kmh, 'distance_km', v_dist_km, 'time_diff_sec', v_time_diff)
        );
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Safe trigger drop & creation
DROP TRIGGER IF EXISTS trigger_check_gps_spoofing ON public.worker_locations;
CREATE TRIGGER trigger_check_gps_spoofing
  AFTER UPDATE OF latitude, longitude ON public.worker_locations
  FOR EACH ROW EXECUTE FUNCTION public.check_gps_spoofing();

-- 13. Booking audit log trigger function
CREATE OR REPLACE FUNCTION public.audit_booking_changes()
RETURNS TRIGGER AS $$
DECLARE
  v_actor UUID;
BEGIN
  -- Get active auth user (if running in authenticated session)
  v_actor := auth.uid();
  
  -- Insert audit log
  INSERT INTO public.booking_audit_logs (
    booking_id,
    actor_id,
    action,
    old_status,
    new_status,
    notes,
    metadata
  ) VALUES (
    NEW.id,
    v_actor,
    CASE 
      WHEN TG_OP = 'INSERT' THEN 'create'
      WHEN OLD.status != NEW.status THEN 'status_change'
      ELSE 'update'
    END,
    CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE OLD.status END,
    NEW.status,
    CASE 
      WHEN TG_OP = 'INSERT' THEN 'Booking created.'
      WHEN OLD.status != NEW.status THEN 'Status changed from ' || OLD.status || ' to ' || NEW.status || '.'
      ELSE 'Booking details updated.'
    END,
    jsonb_build_object(
      'payment_method', NEW.payment_method,
      'payment_status', NEW.payment_status,
      'worker_id', NEW.worker_id,
      'total_price', NEW.total_price
    )
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Safe trigger drop & creation
DROP TRIGGER IF EXISTS trigger_audit_booking_changes ON public.bookings;
CREATE TRIGGER trigger_audit_booking_changes
  AFTER INSERT OR UPDATE ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.audit_booking_changes();

-- 14. Expose active availability check update
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
    AND wa.status = 'available'
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
