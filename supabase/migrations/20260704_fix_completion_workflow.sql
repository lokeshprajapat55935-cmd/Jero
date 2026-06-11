-- ============================================================
-- Migration: 20260704_fix_completion_workflow.sql
-- Description: Fixes status transitions and OTP generation RPC
-- ============================================================

-- 1. Update validate_booking_state_transition to allow work_started -> work_completed_pending_otp
-- and also allow other valid transitions that might have been missed.
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
  ELSIF OLD.status = 'work_started' AND NEW.status NOT IN ('work_completed', 'work_completed_pending_otp', 'cancelled', 'disputed') THEN
    RAISE EXCEPTION 'Invalid transition from work_started to %', NEW.status;
  ELSIF OLD.status = 'started' AND NEW.status NOT IN ('work_completed', 'work_completed_pending_otp', 'cancelled', 'disputed') THEN
    RAISE EXCEPTION 'Invalid transition from started to %', NEW.status;
  ELSIF OLD.status = 'work_completed' AND NEW.status NOT IN ('awaiting_item_approval', 'work_completed_pending_otp', 'completed') THEN
    RAISE EXCEPTION 'Invalid transition from work_completed to %', NEW.status;
  ELSIF OLD.status = 'work_completed_pending_otp' AND NEW.status NOT IN ('completed', 'disputed') THEN
    RAISE EXCEPTION 'Invalid transition from work_completed_pending_otp to %', NEW.status;
  ELSIF OLD.status = 'awaiting_item_approval' AND NEW.status NOT IN ('item_approved', 'disputed', 'cancelled') THEN
    RAISE EXCEPTION 'Invalid transition from awaiting_item_approval to %', NEW.status;
  ELSIF OLD.status = 'item_approved' AND NEW.status NOT IN ('otp_generated', 'work_completed_pending_otp', 'disputed', 'cancelled') THEN
    RAISE EXCEPTION 'Invalid transition from item_approved to %', NEW.status;
  ELSIF OLD.status = 'otp_generated' AND NEW.status NOT IN ('awaiting_otp', 'otp_verified', 'disputed') THEN
    RAISE EXCEPTION 'Invalid transition from otp_generated to %', NEW.status;
  ELSIF OLD.status = 'awaiting_otp' AND NEW.status NOT IN ('otp_verified', 'disputed') THEN
    RAISE EXCEPTION 'Invalid transition from awaiting_otp to %', NEW.status;
  ELSIF OLD.status = 'otp_verified' AND NEW.status NOT IN ('awaiting_payment', 'disputed', 'completed') THEN
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

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 2. Update generate_completion_otp to support work_started and item_approved statuses
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
  
  -- Transition booking status to 'work_completed_pending_otp' if it's in a preliminary state
  IF v_booking.status IN ('started', 'work_started', 'work_completed', 'item_approved') THEN
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
