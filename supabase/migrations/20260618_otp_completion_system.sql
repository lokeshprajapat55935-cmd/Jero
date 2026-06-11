-- ============================================================
-- Migration: 20260618_otp_completion_system.sql
-- Description: Database schema and functions for OTP-Based Job Completion.
-- ============================================================

-- 1. Create booking_completion_otps table
CREATE TABLE IF NOT EXISTS public.booking_completion_otps (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  booking_id UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  otp_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  attempts INTEGER DEFAULT 0 NOT NULL,
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Enable RLS and create security policies
ALTER TABLE public.booking_completion_otps ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view completion OTP records" ON public.booking_completion_otps;
CREATE POLICY "Admins can view completion OTP records" ON public.booking_completion_otps
  FOR SELECT USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "Participants can view own completion OTP records" ON public.booking_completion_otps;
CREATE POLICY "Participants can view own completion OTP records" ON public.booking_completion_otps
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.bookings b
      WHERE b.id = booking_completion_otps.booking_id AND (b.client_id = auth.uid() OR b.worker_id = auth.uid())
    )
  );

-- 3. Add Index for performance
CREATE INDEX IF NOT EXISTS idx_booking_completion_otps_booking ON public.booking_completion_otps(booking_id);

-- 4. Redefine validate_booking_state_transition to support both old and new flows
CREATE OR REPLACE FUNCTION public.validate_booking_state_transition()
RETURNS TRIGGER AS $$
DECLARE
  v_worker_lat NUMERIC;
  v_worker_lng NUMERIC;
  v_distance_m NUMERIC;
  v_cancel_count INTEGER;
  v_cancellation_threshold INTEGER;
  v_is_admin BOOLEAN;
BEGIN
  -- Check if user is admin
  SELECT EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() AND role = 'admin'
  ) INTO v_is_admin;

  -- If status hasn't changed, allow the update
  IF OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  -- Admin can force complete or force cancel from any non-terminal state
  IF v_is_admin AND NEW.status IN ('completed', 'cancelled') THEN
    RETURN NEW;
  END IF;

  -- Allowed transition paths:
  IF OLD.status = 'pending' AND NEW.status NOT IN ('accepted', 'cancelled', 'broadcasting') THEN
    RAISE EXCEPTION 'Invalid transition from pending to %', NEW.status;
  ELSIF OLD.status = 'broadcasting' AND NEW.status NOT IN ('accepted', 'cancelled', 'no_worker_available') THEN
    RAISE EXCEPTION 'Invalid transition from broadcasting to %', NEW.status;
  ELSIF OLD.status = 'accepted' AND NEW.status NOT IN ('worker_arriving', 'en_route', 'cancelled') THEN
    RAISE EXCEPTION 'Invalid transition from accepted to %', NEW.status;
  ELSIF OLD.status = 'worker_arriving' AND NEW.status NOT IN ('arrived', 'work_started', 'cancelled') THEN
    RAISE EXCEPTION 'Invalid transition from worker_arriving to %', NEW.status;
  ELSIF OLD.status = 'en_route' AND NEW.status NOT IN ('started', 'cancelled') THEN
    RAISE EXCEPTION 'Invalid transition from en_route to %', NEW.status;
  ELSIF OLD.status = 'arrived' AND NEW.status NOT IN ('work_started', 'cancelled') THEN
    RAISE EXCEPTION 'Invalid transition from arrived to %', NEW.status;
  ELSIF OLD.status = 'work_started' AND NEW.status NOT IN ('work_completed', 'cancelled', 'disputed') THEN
    RAISE EXCEPTION 'Invalid transition from work_started to %', NEW.status;
  ELSIF OLD.status = 'started' AND NEW.status NOT IN ('work_completed_pending_otp', 'cancelled', 'disputed') THEN
    RAISE EXCEPTION 'Invalid transition from started to %', NEW.status;
  ELSIF OLD.status = 'work_completed' AND NEW.status NOT IN ('awaiting_item_approval') THEN
    RAISE EXCEPTION 'Invalid transition from work_completed to %', NEW.status;
  ELSIF OLD.status = 'work_completed_pending_otp' AND NEW.status NOT IN ('completed', 'disputed') THEN
    RAISE EXCEPTION 'Invalid transition from work_completed_pending_otp to %', NEW.status;
  ELSIF OLD.status = 'awaiting_item_approval' AND NEW.status NOT IN ('item_approved', 'disputed', 'cancelled') THEN
    RAISE EXCEPTION 'Invalid transition from awaiting_item_approval to %', NEW.status;
  ELSIF OLD.status = 'item_approved' AND NEW.status NOT IN ('otp_generated', 'disputed', 'cancelled') THEN
    RAISE EXCEPTION 'Invalid transition from item_approved to %', NEW.status;
  ELSIF OLD.status = 'otp_generated' AND NEW.status NOT IN ('awaiting_otp', 'otp_verified', 'disputed') THEN
    RAISE EXCEPTION 'Invalid transition from otp_generated to %', NEW.status;
  ELSIF OLD.status = 'awaiting_otp' AND NEW.status NOT IN ('otp_verified', 'disputed') THEN
    RAISE EXCEPTION 'Invalid transition from awaiting_otp to %', NEW.status;
  ELSIF OLD.status = 'otp_verified' AND NEW.status NOT IN ('awaiting_payment', 'disputed') THEN
    RAISE EXCEPTION 'Invalid transition from otp_verified to %', NEW.status;
  ELSIF OLD.status = 'awaiting_payment' AND NEW.status NOT IN ('payment_processing', 'completed', 'failed', 'disputed') THEN
    RAISE EXCEPTION 'Invalid transition from awaiting_payment to %', NEW.status;
  ELSIF OLD.status = 'payment_processing' AND NEW.status NOT IN ('payment_verified', 'completed', 'failed', 'disputed') THEN
    RAISE EXCEPTION 'Invalid transition from payment_processing to %', NEW.status;
  ELSIF OLD.status = 'payment_verified' AND NEW.status NOT IN ('completed') THEN
    RAISE EXCEPTION 'Invalid transition from payment_verified to %', NEW.status;
  ELSIF OLD.status IN ('completed', 'cancelled', 'failed') THEN
    RAISE EXCEPTION 'Cannot transition from terminal state %', OLD.status;
  ELSIF OLD.status = 'disputed' AND NEW.status NOT IN ('completed', 'cancelled') THEN
    RAISE EXCEPTION 'Invalid transition from disputed to %', NEW.status;
  END IF;

  -- GPS Fraud Check: verify worker is close to client on work_started/started and work_completed/work_completed_pending_otp status updates
  IF NEW.status IN ('work_started', 'started', 'work_completed', 'work_completed_pending_otp') AND NEW.worker_id IS NOT NULL AND (OLD.status IS DISTINCT FROM NEW.status) THEN
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
        
        RAISE EXCEPTION 'Worker is too far from the booking location to update status to % (Distance: %m).', NEW.status, ROUND(v_distance_m, 0);
      END IF;
    END IF;
  END IF;

  -- Cancellation rate check
  IF NEW.status = 'cancelled' AND OLD.status != 'cancelled' THEN
    SELECT value::INTEGER INTO v_cancellation_threshold
    FROM public.platform_config
    WHERE key = 'fraud_cancellation_threshold' LIMIT 1;
    
    v_cancellation_threshold := COALESCE(v_cancellation_threshold, 5);

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
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Stored Procedure for OTP generation
CREATE OR REPLACE FUNCTION public.generate_completion_otp(p_booking_id UUID, p_otp_hash TEXT, p_worker_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_booking public.bookings;
  v_now TIMESTAMPTZ := NOW();
BEGIN
  -- Fetch booking
  SELECT * INTO v_booking FROM public.bookings WHERE id = p_booking_id FOR UPDATE;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Booking not found');
  END IF;
  
  -- Verify worker ownership
  IF v_booking.worker_id IS DISTINCT FROM p_worker_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Forbidden: Only the assigned worker can manage completion.');
  END IF;
  
  -- Invalidate any existing OTPs for this booking
  UPDATE public.booking_completion_otps
  SET expires_at = v_now
  WHERE booking_id = p_booking_id AND verified_at IS NULL;
  
  -- Insert new OTP
  INSERT INTO public.booking_completion_otps (booking_id, otp_hash, expires_at)
  VALUES (p_booking_id, p_otp_hash, v_now + INTERVAL '10 minutes');
  
  -- Transition booking status to 'work_completed_pending_otp' if it's currently 'started'
  IF v_booking.status = 'started' THEN
    UPDATE public.bookings
    SET status = 'work_completed_pending_otp', updated_at = v_now
    WHERE id = p_booking_id;
    
    INSERT INTO public.booking_timeline (booking_id, status, reason, created_by)
    VALUES (p_booking_id, 'work_completed_pending_otp', 'Worker marked job as completed. OTP generated.', p_worker_id);
  ELSE
    -- If it's already in work_completed_pending_otp, we just log the regeneration
    INSERT INTO public.booking_timeline (booking_id, status, reason, created_by)
    VALUES (p_booking_id, v_booking.status, 'Completion OTP regenerated by worker.', p_worker_id);
  END IF;
  
  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. Stored Procedure for OTP verification
CREATE OR REPLACE FUNCTION public.verify_completion_otp(p_booking_id UUID, p_otp_hash TEXT, p_worker_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_booking public.bookings;
  v_otp public.booking_completion_otps;
  v_now TIMESTAMPTZ := NOW();
  v_max_attempts INTEGER := 5;
  v_commission_res JSONB;
BEGIN
  -- Fetch booking
  SELECT * INTO v_booking FROM public.bookings WHERE id = p_booking_id FOR UPDATE;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Booking not found', 'code', 404);
  END IF;
  
  -- Verify worker ownership
  IF v_booking.worker_id IS DISTINCT FROM p_worker_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Forbidden: Only the assigned worker can verify completion.', 'code', 403);
  END IF;
  
  -- Check if booking is in correct state
  IF v_booking.status IS DISTINCT FROM 'work_completed_pending_otp' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Booking is not awaiting OTP verification', 'code', 400);
  END IF;
  
  -- Fetch latest unverified active OTP
  SELECT * INTO v_otp FROM public.booking_completion_otps
  WHERE booking_id = p_booking_id AND verified_at IS NULL AND expires_at > v_now
  ORDER BY created_at DESC LIMIT 1
  FOR UPDATE;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'OTP has expired or is invalid. Please request a new OTP.', 'code', 400);
  END IF;
  
  -- Check attempt limit
  IF v_otp.attempts >= v_max_attempts THEN
    -- Mark booking as disputed
    UPDATE public.bookings
    SET status = 'disputed', updated_at = v_now
    WHERE id = p_booking_id;
    
    INSERT INTO public.booking_timeline (booking_id, status, reason, created_by)
    VALUES (p_booking_id, 'disputed', 'OTP verification blocked: too many failed attempts.', p_worker_id);
    
    -- Log fraud flags
    INSERT INTO public.fraud_flags (user_id, flag_type, severity, status, description, booking_id, evidence)
    VALUES (
      p_worker_id,
      'wallet_abuse',
      'high',
      'open',
      'Worker exceeded completion OTP retry attempts limit. Potential brute force attempt.',
      p_booking_id,
      jsonb_build_object('attempts', v_otp.attempts, 'max_attempts', v_max_attempts)
    );
    
    RETURN jsonb_build_object('success', false, 'error', 'Too many verification attempts. Booking marked as disputed.', 'code', 429);
  END IF;
  
  -- Verify OTP hash
  IF v_otp.otp_hash = p_otp_hash THEN
    -- Match! Update OTP record
    UPDATE public.booking_completion_otps
    SET verified_at = v_now
    WHERE id = v_otp.id;
    
    -- Try deducting commission if cash booking
    IF v_booking.payment_method = 'cash' THEN
      v_commission_res := public.process_booking_commission(p_booking_id);
    END IF;
    
    -- Mark booking completed, update payment status
    UPDATE public.bookings
    SET status = 'completed',
        payment_status = 'paid',
        updated_at = v_now
    WHERE id = p_booking_id;
    
    -- Clear active bookings
    DELETE FROM public.active_bookings WHERE booking_id = p_booking_id;
    
    -- Log timeline
    INSERT INTO public.booking_timeline (booking_id, status, reason, created_by)
    VALUES (p_booking_id, 'completed', 'Job completion OTP verified successfully. Booking completed.', p_worker_id);
    
    -- Note: sync_booking_completion_and_release trigger runs automatically and sets worker to online!
    
    RETURN jsonb_build_object('success', true);
  ELSE
    -- Mismatch! Increment attempts
    UPDATE public.booking_completion_otps
    SET attempts = attempts + 1
    WHERE id = v_otp.id;
    
    -- If it was the last attempt, trigger lockout block
    IF v_otp.attempts + 1 >= v_max_attempts THEN
      UPDATE public.bookings
      SET status = 'disputed', updated_at = v_now
      WHERE id = p_booking_id;
      
      INSERT INTO public.booking_timeline (booking_id, status, reason, created_by)
      VALUES (p_booking_id, 'disputed', 'OTP verification limit reached. Booking locked.', p_worker_id);
      
      INSERT INTO public.fraud_flags (user_id, flag_type, severity, status, description, booking_id, evidence)
      VALUES (
        p_worker_id,
        'wallet_abuse',
        'high',
        'open',
        'Worker exceeded OTP retry attempts limit. Potential brute force attempt.',
        p_booking_id,
        jsonb_build_object('attempts', v_otp.attempts + 1, 'max_attempts', v_max_attempts)
      );
      
      RETURN jsonb_build_object('success', false, 'error', 'Invalid OTP. Attempt limit exceeded. Booking marked as disputed.', 'code', 429);
    END IF;
    
    RETURN jsonb_build_object(
      'success', false, 
      'error', 'Invalid verification code.', 
      'attempts_remaining', (v_max_attempts - (v_otp.attempts + 1)), 
      'code', 400
    );
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. Stored Procedure for Customer Confirming Completion directly
CREATE OR REPLACE FUNCTION public.client_confirm_completion(p_booking_id UUID, p_client_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_booking public.bookings;
  v_commission_res JSONB;
  v_now TIMESTAMPTZ := NOW();
BEGIN
  -- Fetch booking
  SELECT * INTO v_booking FROM public.bookings WHERE id = p_booking_id FOR UPDATE;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Booking not found');
  END IF;
  
  -- Verify client ownership
  IF v_booking.client_id IS DISTINCT FROM p_client_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Forbidden: Only the customer can confirm completion.');
  END IF;
  
  -- Check status
  IF v_booking.status IS DISTINCT FROM 'work_completed_pending_otp' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Booking is not in work completed pending state');
  END IF;
  
  -- Deduct commission if cash booking
  IF v_booking.payment_method = 'cash' THEN
    v_commission_res := public.process_booking_commission(p_booking_id);
  END IF;
  
  -- Update status to completed
  UPDATE public.bookings
  SET status = 'completed', 
      payment_status = 'paid', 
      updated_at = v_now
  WHERE id = p_booking_id;
  
  -- Clear active bookings
  DELETE FROM public.active_bookings WHERE booking_id = p_booking_id;
  
  -- Invalidate any active completion OTPs
  UPDATE public.booking_completion_otps
  SET verified_at = v_now
  WHERE booking_id = p_booking_id AND verified_at IS NULL;
  
  INSERT INTO public.booking_timeline (booking_id, status, reason, created_by)
  VALUES (p_booking_id, 'completed', 'Booking completed directly by customer in-app.', p_client_id);
  
  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
