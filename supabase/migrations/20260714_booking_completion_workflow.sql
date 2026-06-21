-- ============================================================
-- Migration: 20260714_booking_completion_workflow.sql
-- Description: Updates the database schema and triggers for the new booking completion workflow.
-- ============================================================

-- 1. Add category to booking_items
ALTER TABLE public.booking_items
ADD COLUMN IF NOT EXISTS category TEXT;

-- 2. Update the booking state machine transitions
CREATE OR REPLACE FUNCTION public.validate_booking_state_transition()
RETURNS TRIGGER AS $$
DECLARE
  v_worker_lat NUMERIC;
  v_worker_lng NUMERIC;
  v_distance_m NUMERIC;
  v_cancel_count INTEGER;
  v_cancellation_threshold INTEGER;
BEGIN
  -- We allow the legacy path for backwards compatibility or enforce the new path
  -- New path: 
  -- work_started -> bill_submitted -> customer_review -> payment_pending / otp_generated
  -- customer_review -> pending_review (dispute)
  -- payment_pending -> otp_generated (after payment)
  -- otp_generated -> otp_verified -> completed

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF OLD.status = 'pending' AND NEW.status NOT IN ('broadcasting', 'cancelled') THEN
      RAISE EXCEPTION 'Invalid transition from pending to %', NEW.status;
    ELSIF OLD.status = 'broadcasting' AND NEW.status NOT IN ('accepted', 'cancelled', 'no_worker_available') THEN
      RAISE EXCEPTION 'Invalid transition from broadcasting to %', NEW.status;
    ELSIF OLD.status = 'accepted' AND NEW.status NOT IN ('worker_arriving', 'cancelled') THEN
      RAISE EXCEPTION 'Invalid transition from accepted to %', NEW.status;
    ELSIF OLD.status = 'worker_arriving' AND NEW.status NOT IN ('arrived', 'work_started', 'cancelled') THEN
      RAISE EXCEPTION 'Invalid transition from worker_arriving to %', NEW.status;
    ELSIF OLD.status = 'arrived' AND NEW.status NOT IN ('work_started', 'cancelled') THEN
      RAISE EXCEPTION 'Invalid transition from arrived to %', NEW.status;
    ELSIF OLD.status = 'work_started' AND NEW.status NOT IN ('work_completed', 'bill_submitted', 'cancelled') THEN
      RAISE EXCEPTION 'Invalid transition from work_started to %', NEW.status;
      
    -- Legacy paths
    ELSIF OLD.status = 'work_completed' AND NEW.status NOT IN ('awaiting_item_approval', 'work_completed_pending_otp', 'bill_submitted') THEN
      RAISE EXCEPTION 'Invalid transition from work_completed to %', NEW.status;
    ELSIF OLD.status = 'awaiting_item_approval' AND NEW.status NOT IN ('item_approved') THEN
      RAISE EXCEPTION 'Invalid transition from awaiting_item_approval to %', NEW.status;
    ELSIF OLD.status = 'item_approved' AND NEW.status NOT IN ('otp_generated', 'work_completed_pending_otp') THEN
      RAISE EXCEPTION 'Invalid transition from item_approved to %', NEW.status;
      
    -- New Path transitions
    ELSIF OLD.status = 'bill_submitted' AND NEW.status NOT IN ('customer_review') THEN
      RAISE EXCEPTION 'Invalid transition from bill_submitted to %', NEW.status;
    ELSIF OLD.status = 'customer_review' AND NEW.status NOT IN ('payment_pending', 'otp_generated', 'pending_review') THEN
      RAISE EXCEPTION 'Invalid transition from customer_review to %', NEW.status;
    ELSIF OLD.status = 'pending_review' AND NEW.status NOT IN ('payment_pending', 'otp_generated', 'cancelled') THEN
      RAISE EXCEPTION 'Invalid transition from pending_review to %', NEW.status;
      
    -- Payment and OTP
    ELSIF OLD.status = 'payment_pending' AND NEW.status NOT IN ('otp_generated', 'disputed') THEN
      RAISE EXCEPTION 'Invalid transition from payment_pending to %', NEW.status;
    ELSIF OLD.status = 'otp_generated' AND NEW.status NOT IN ('otp_verified', 'disputed') THEN
      RAISE EXCEPTION 'Invalid transition from otp_generated to %', NEW.status;
    ELSIF OLD.status = 'work_completed_pending_otp' AND NEW.status NOT IN ('otp_verified', 'completed', 'disputed') THEN
      RAISE EXCEPTION 'Invalid transition from work_completed_pending_otp to %', NEW.status;
    ELSIF OLD.status = 'otp_verified' AND NEW.status NOT IN ('completed', 'awaiting_payment') THEN
      RAISE EXCEPTION 'Invalid transition from otp_verified to %', NEW.status;
      
    -- Legacy payment after OTP
    ELSIF OLD.status = 'awaiting_payment' AND NEW.status NOT IN ('payment_processing', 'disputed') THEN
      RAISE EXCEPTION 'Invalid transition from awaiting_payment to %', NEW.status;
    ELSIF OLD.status = 'payment_processing' AND NEW.status NOT IN ('payment_verified', 'disputed') THEN
      RAISE EXCEPTION 'Invalid transition from payment_processing to %', NEW.status;
    ELSIF OLD.status = 'payment_verified' AND NEW.status NOT IN ('completed') THEN
      RAISE EXCEPTION 'Invalid transition from payment_verified to %', NEW.status;
      
    -- Terminal states
    ELSIF OLD.status = 'completed' THEN
      RAISE EXCEPTION 'Booking is already completed';
    ELSIF OLD.status = 'paid_completed' THEN
      RAISE EXCEPTION 'Booking is already paid and completed';
    ELSIF OLD.status = 'cancelled' THEN
      RAISE EXCEPTION 'Cannot modify state of a cancelled booking';
    ELSIF OLD.status = 'disputed' AND NEW.status NOT IN ('completed', 'cancelled') THEN
      RAISE EXCEPTION 'Invalid transition from disputed to %', NEW.status;
    ELSIF OLD.status = 'no_worker_available' THEN
      RAISE EXCEPTION 'Booking has no worker available';
    END IF;
  END IF;

  -- GPS Fraud Check: verify worker is close to client on work_started and bill_submitted status updates
  IF NEW.status IN ('work_started', 'bill_submitted', 'work_completed') AND NEW.worker_id IS NOT NULL AND (OLD.status IS DISTINCT FROM NEW.status) THEN
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

-- 3. Modify check_booking_items_immutable to support new path
CREATE OR REPLACE FUNCTION public.check_booking_items_immutable()
RETURNS TRIGGER AS $$
DECLARE
  v_status TEXT;
BEGIN
  SELECT status INTO v_status FROM public.bookings WHERE id = COALESCE(NEW.booking_id, OLD.booking_id);
  IF v_status IN ('customer_review', 'payment_pending', 'pending_review', 'item_approved', 'otp_generated', 'otp_verified', 'awaiting_payment', 'payment_processing', 'payment_verified', 'completed', 'cancelled', 'disputed') THEN
    RAISE EXCEPTION 'Booking items are locked and immutable after approval (status: %).', v_status;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. RPC for fetching frequent items dynamically based on worker history
CREATE OR REPLACE FUNCTION public.get_worker_frequent_items(p_worker_id UUID, p_category TEXT, p_limit INTEGER DEFAULT 10)
RETURNS TABLE (name TEXT, category TEXT, unit_price NUMERIC, usage_count BIGINT) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    bi.name,
    bi.category,
    MAX(bi.unit_price) AS unit_price,
    COUNT(*) AS usage_count
  FROM public.booking_items bi
  JOIN public.bookings b ON bi.booking_id = b.id
  WHERE b.worker_id = p_worker_id
    AND b.category = p_category
    AND bi.category IS NOT NULL
  GROUP BY bi.name, bi.category
  ORDER BY usage_count DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
