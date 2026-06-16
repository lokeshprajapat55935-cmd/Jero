-- ============================================================
-- Migration: 20260712_sync_state_machine_v2.sql
-- Description: Synchronize database state machine with the updated
--              BookingStatus constants.ts. Restores legacy aliases
--              and adds missing intermediate states like payment_verified.
-- ============================================================

CREATE OR REPLACE FUNCTION public.validate_booking_state_transition()
RETURNS TRIGGER AS $$
DECLARE
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
  IF OLD.status = 'scheduled' AND NEW.status NOT IN ('broadcasting', 'cancelled') THEN
    RAISE EXCEPTION 'Invalid transition from scheduled to %', NEW.status;
  ELSIF OLD.status = 'pending' AND NEW.status NOT IN ('broadcasting', 'cancelled', 'accepted') THEN
    RAISE EXCEPTION 'Invalid transition from pending to %', NEW.status;
  ELSIF OLD.status = 'broadcasting' AND NEW.status NOT IN ('accepted', 'cancelled', 'no_worker_available') THEN
    RAISE EXCEPTION 'Invalid transition from broadcasting to %', NEW.status;
  ELSIF OLD.status = 'accepted' AND NEW.status NOT IN ('worker_arriving', 'en_route', 'arrived', 'cancelled') THEN
    RAISE EXCEPTION 'Invalid transition from accepted to %', NEW.status;
  ELSIF OLD.status = 'worker_arriving' AND NEW.status NOT IN ('arrived', 'work_started', 'started', 'cancelled') THEN
    RAISE EXCEPTION 'Invalid transition from worker_arriving to %', NEW.status;
  ELSIF OLD.status = 'en_route' AND NEW.status NOT IN ('arrived', 'started', 'cancelled') THEN
    RAISE EXCEPTION 'Invalid transition from en_route to %', NEW.status;
  ELSIF OLD.status = 'arrived' AND NEW.status NOT IN ('work_started', 'started', 'cancelled') THEN
    RAISE EXCEPTION 'Invalid transition from arrived to %', NEW.status;
  
  -- Work Stages
  ELSIF OLD.status IN ('work_started', 'started', 'in_progress') AND NEW.status NOT IN ('work_completed', 'awaiting_item_approval', 'work_completed_pending_otp', 'otp_generated', 'cancelled', 'disputed') THEN
    RAISE EXCEPTION 'Invalid transition from % to %', OLD.status, NEW.status;
  
  -- Completion / Item Approval Stages
  ELSIF OLD.status = 'work_completed' AND NEW.status NOT IN ('awaiting_item_approval', 'work_completed_pending_otp', 'otp_generated', 'completed') THEN
    RAISE EXCEPTION 'Invalid transition from work_completed to %', NEW.status;
  ELSIF OLD.status = 'awaiting_item_approval' AND NEW.status NOT IN ('item_approved', 'disputed', 'cancelled') THEN
    RAISE EXCEPTION 'Invalid transition from awaiting_item_approval to %', NEW.status;
  ELSIF OLD.status = 'item_approved' AND NEW.status NOT IN ('awaiting_payment', 'work_completed_pending_otp', 'otp_generated', 'disputed', 'cancelled') THEN
    RAISE EXCEPTION 'Invalid transition from item_approved to %', NEW.status;
  
  -- Payment Stages
  ELSIF OLD.status = 'awaiting_payment' AND NEW.status NOT IN ('payment_processing', 'payment_verified', 'work_completed_pending_otp', 'otp_generated', 'completed', 'disputed') THEN
    RAISE EXCEPTION 'Invalid transition from awaiting_payment to %', NEW.status;
  ELSIF OLD.status = 'payment_processing' AND NEW.status NOT IN ('payment_verified', 'work_completed_pending_otp', 'otp_generated', 'completed', 'awaiting_payment', 'disputed') THEN
    RAISE EXCEPTION 'Invalid transition from payment_processing to %', NEW.status;
  ELSIF OLD.status = 'payment_verified' AND NEW.status NOT IN ('work_completed_pending_otp', 'otp_generated', 'completed', 'disputed') THEN
    RAISE EXCEPTION 'Invalid transition from payment_verified to %', NEW.status;
  
  -- OTP Stages
  ELSIF OLD.status IN ('work_completed_pending_otp', 'otp_generated', 'awaiting_otp') AND NEW.status NOT IN ('otp_verified', 'completed', 'disputed') THEN
    RAISE EXCEPTION 'Invalid transition from % to %', OLD.status, NEW.status;
  ELSIF OLD.status = 'otp_verified' AND NEW.status NOT IN ('awaiting_payment', 'completed', 'disputed') THEN
    RAISE EXCEPTION 'Invalid transition from otp_verified to %', NEW.status;
  
  -- Terminal States
  ELSIF OLD.status IN ('completed', 'paid_completed', 'cancelled', 'no_worker_available') THEN
    RAISE EXCEPTION 'Cannot transition from terminal state %', OLD.status;
  
  -- Disputes
  ELSIF OLD.status = 'disputed' AND NEW.status NOT IN ('completed', 'cancelled') THEN
    RAISE EXCEPTION 'Invalid transition from disputed to %', NEW.status;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
