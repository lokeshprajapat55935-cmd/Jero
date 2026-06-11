-- ============================================================
-- Zolvo Cash-on-Service Payment & Commission Model
-- ============================================================

-- 1. Expand wallet_transactions.type
ALTER TABLE public.wallet_transactions DROP CONSTRAINT IF EXISTS wallet_transactions_type_check;
ALTER TABLE public.wallet_transactions ADD CONSTRAINT wallet_transactions_type_check
  CHECK (type IN ('credit', 'debit', 'commission', 'adjustment', 'recharge', 'online_credit', 'bonus', 'refund', 'pending_recharge'));

-- 2. Add reference_id to wallet_transactions
ALTER TABLE public.wallet_transactions ADD COLUMN IF NOT EXISTS reference_id TEXT;

-- 3. Create commission_records table
CREATE TABLE IF NOT EXISTS public.commission_records (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  booking_id UUID REFERENCES public.bookings(id) ON DELETE CASCADE,
  worker_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  service_charge NUMERIC NOT NULL,
  commission_rate NUMERIC NOT NULL DEFAULT 0.10,
  commission_amount NUMERIC NOT NULL,
  wallet_balance_before NUMERIC NOT NULL,
  wallet_balance_after NUMERIC NOT NULL,
  deducted_at TIMESTAMPTZ DEFAULT now()
);

-- RLS for commission_records
ALTER TABLE public.commission_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Workers can view own commission records" ON public.commission_records
  FOR SELECT USING (auth.uid() = worker_id);

CREATE POLICY "Admins can manage commission records" ON public.commission_records
  FOR ALL USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

-- 4. Update state transition trigger to fix `payment_processing` -> `completed` violation
CREATE OR REPLACE FUNCTION public.validate_booking_state_transition()
RETURNS TRIGGER AS $$
DECLARE
  v_worker_lat NUMERIC;
  v_worker_lng NUMERIC;
  v_distance_m NUMERIC;
  v_cancel_count INTEGER;
  v_cancellation_threshold INTEGER;
BEGIN
  -- Strict 14-state path + cancelled + disputed
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF OLD.status = 'pending' AND NEW.status NOT IN ('broadcasting', 'cancelled') THEN
      RAISE EXCEPTION 'Invalid transition from pending to %', NEW.status;
    ELSIF OLD.status = 'broadcasting' AND NEW.status NOT IN ('accepted', 'cancelled') THEN
      RAISE EXCEPTION 'Invalid transition from broadcasting to %', NEW.status;
    ELSIF OLD.status = 'accepted' AND NEW.status NOT IN ('worker_arriving', 'cancelled') THEN
      RAISE EXCEPTION 'Invalid transition from accepted to %', NEW.status;
    ELSIF OLD.status = 'worker_arriving' AND NEW.status NOT IN ('work_started', 'cancelled') THEN
      RAISE EXCEPTION 'Invalid transition from worker_arriving to %', NEW.status;
    ELSIF OLD.status = 'work_started' AND NEW.status NOT IN ('work_completed', 'cancelled') THEN
      RAISE EXCEPTION 'Invalid transition from work_started to %', NEW.status;
    ELSIF OLD.status = 'work_completed' AND NEW.status NOT IN ('awaiting_item_approval') THEN
      RAISE EXCEPTION 'Invalid transition from work_completed to %', NEW.status;
    ELSIF OLD.status = 'awaiting_item_approval' AND NEW.status NOT IN ('item_approved') THEN
      RAISE EXCEPTION 'Invalid transition from awaiting_item_approval to %', NEW.status;
    ELSIF OLD.status = 'item_approved' AND NEW.status NOT IN ('otp_generated') THEN
      RAISE EXCEPTION 'Invalid transition from item_approved to %', NEW.status;
    ELSIF OLD.status = 'otp_generated' AND NEW.status NOT IN ('otp_verified', 'disputed') THEN
      RAISE EXCEPTION 'Invalid transition from otp_generated to %', NEW.status;
    ELSIF OLD.status = 'otp_verified' AND NEW.status NOT IN ('awaiting_payment') THEN
      RAISE EXCEPTION 'Invalid transition from otp_verified to %', NEW.status;
    ELSIF OLD.status = 'awaiting_payment' AND NEW.status NOT IN ('payment_processing', 'completed', 'disputed') THEN
      RAISE EXCEPTION 'Invalid transition from awaiting_payment to % (OTP is verified, payment required)', NEW.status;
    ELSIF OLD.status = 'payment_processing' AND NEW.status NOT IN ('payment_verified', 'completed', 'disputed') THEN
      RAISE EXCEPTION 'Invalid transition from payment_processing to %', NEW.status;
    ELSIF OLD.status = 'payment_verified' AND NEW.status NOT IN ('completed') THEN
      RAISE EXCEPTION 'Invalid transition from payment_verified to %', NEW.status;
    ELSIF OLD.status = 'completed' THEN
      RAISE EXCEPTION 'Booking is already completed';
    ELSIF OLD.status = 'cancelled' THEN
      RAISE EXCEPTION 'Cannot modify state of a cancelled booking';
    ELSIF OLD.status = 'disputed' AND NEW.status NOT IN ('completed', 'cancelled') THEN
      RAISE EXCEPTION 'Invalid transition from disputed to %', NEW.status;
    END IF;
  END IF;

  -- GPS Fraud Check: verify worker is close to client on work_started and work_completed status updates
  IF NEW.status IN ('work_started', 'work_completed') AND NEW.worker_id IS NOT NULL AND (OLD.status IS DISTINCT FROM NEW.status) THEN
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


-- 5. Update process_booking_commission to clear active_bookings & write to commission_records
CREATE OR REPLACE FUNCTION public.process_booking_commission(p_booking_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_booking RECORD;
  v_wallet RECORD;
  v_commission_rate NUMERIC;
  v_commission NUMERIC;
  v_new_balance NUMERIC;
BEGIN
  -- Fetch booking details (lock the row to prevent race conditions)
  SELECT b.id, b.worker_id, b.service_charge, b.total_price, b.payment_method,
         b.commission_deducted, b.status, b.commission_amount
  INTO v_booking
  FROM public.bookings b
  WHERE b.id = p_booking_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking not found: %', p_booking_id;
  END IF;

  -- Safety checks
  IF v_booking.commission_deducted THEN
    RETURN jsonb_build_object('success', false, 'reason', 'Commission already deducted');
  END IF;

  IF v_booking.payment_method != 'cash' THEN
    RETURN jsonb_build_object('success', false, 'reason', 'Commission only applies to cash payments');
  END IF;

  IF v_booking.worker_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'reason', 'No worker assigned to booking');
  END IF;

  -- Get commission rate from platform_config
  SELECT COALESCE(value::NUMERIC, 0.10) INTO v_commission_rate
  FROM public.platform_config WHERE key = 'commission_rate' LIMIT 1;

  -- Calculate commission on service_charge (working_charge) only (NOT material_charge, NOT visit_charge)
  v_commission := ROUND(COALESCE(v_booking.service_charge, 0) * v_commission_rate, 2);

  -- Fetch and lock worker wallet
  SELECT balance INTO v_wallet
  FROM public.worker_wallets
  WHERE worker_id = v_booking.worker_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Worker wallet not found for worker: %', v_booking.worker_id;
  END IF;

  v_new_balance := v_wallet.balance - v_commission;

  -- Deduct commission from wallet
  UPDATE public.worker_wallets
  SET balance = v_new_balance,
      updated_at = NOW()
  WHERE worker_id = v_booking.worker_id;

  -- Log the commission transaction
  INSERT INTO public.wallet_transactions (
    worker_id, type, amount, balance_after, booking_id, description
  ) VALUES (
    v_booking.worker_id,
    'commission',
    v_commission,
    v_new_balance,
    p_booking_id,
    'Platform commission (' || (v_commission_rate * 100) || '%) on service charge for booking #' || LEFT(p_booking_id::TEXT, 8)
  );

  -- Log in commission_records
  INSERT INTO public.commission_records (
    booking_id, worker_id, service_charge, commission_rate, commission_amount,
    wallet_balance_before, wallet_balance_after
  ) VALUES (
    p_booking_id, v_booking.worker_id, COALESCE(v_booking.service_charge, 0),
    v_commission_rate, v_commission, v_wallet.balance, v_new_balance
  );

  -- Mark commission as deducted on booking
  UPDATE public.bookings
  SET commission_deducted = TRUE,
      commission_amount = v_commission,
      status = 'completed',
      payment_status = 'paid',
      updated_at = NOW()
  WHERE id = p_booking_id;

  -- Clear active bookings
  DELETE FROM public.active_bookings WHERE booking_id = p_booking_id;

  -- Set worker status to online/available
  INSERT INTO public.worker_availability (worker_id, status, last_active_at, current_booking_id)
  VALUES (v_booking.worker_id, 'available', NOW(), NULL)
  ON CONFLICT (worker_id) DO UPDATE 
  SET status = 'available', last_active_at = NOW(), current_booking_id = NULL;

  RETURN jsonb_build_object(
    'success', true,
    'commission', v_commission,
    'new_balance', v_new_balance
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
