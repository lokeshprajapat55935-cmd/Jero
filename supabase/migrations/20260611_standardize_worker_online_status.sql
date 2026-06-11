-- ============================================================
-- Migration: 20260611_standardize_worker_online_status.sql
-- Description: Updates all RPCs to use 'online' status instead of 'available'
--              to match the check constraints in worker_availability.
-- ============================================================

-- 1. Update process_booking_commission
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

  -- Set worker status to online (FIX: was 'available')
  INSERT INTO public.worker_availability (worker_id, status, last_active_at, current_booking_id)
  VALUES (v_booking.worker_id, 'online', NOW(), NULL)
  ON CONFLICT (worker_id) DO UPDATE 
  SET status = 'online', last_active_at = NOW(), current_booking_id = NULL;

  RETURN jsonb_build_object(
    'success', true,
    'commission', v_commission,
    'new_balance', v_new_balance
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Update process_online_payment_credit
CREATE OR REPLACE FUNCTION public.process_online_payment_credit(p_booking_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_booking RECORD;
  v_wallet RECORD;
  v_new_balance NUMERIC;
  v_worker_credit NUMERIC;
BEGIN
  -- Fetch and lock booking
  SELECT b.id, b.worker_id, b.total_price, b.service_charge, b.visit_charge, b.material_charge, b.payment_method,
         b.discount_amount, b.commission_deducted, b.status
  INTO v_booking
  FROM public.bookings b
  WHERE b.id = p_booking_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking not found: %', p_booking_id;
  END IF;

  IF v_booking.payment_method NOT IN ('upi', 'card') THEN
    RETURN jsonb_build_object('success', false, 'reason', 'This function is only for online payments (upi/card)');
  END IF;

  IF v_booking.commission_deducted THEN
    RETURN jsonb_build_object('success', false, 'reason', 'Payment already processed');
  END IF;

  IF v_booking.worker_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'reason', 'No worker assigned');
  END IF;

  -- Worker receives full amount (working_charge + visit_charge + item_charges)
  v_worker_credit := COALESCE(v_booking.service_charge, 0) + COALESCE(v_booking.visit_charge, 0) + COALESCE(v_booking.material_charge, 0);

  -- Fetch and lock wallet
  SELECT balance INTO v_wallet
  FROM public.worker_wallets
  WHERE worker_id = v_booking.worker_id
  FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.worker_wallets (worker_id, balance, currency, updated_at)
    VALUES (v_booking.worker_id, v_worker_credit, 'INR', NOW())
    RETURNING * INTO v_wallet;
  ELSE
    v_new_balance := COALESCE(v_wallet.balance, 0) + v_worker_credit;
    
    UPDATE public.worker_wallets
    SET balance = v_new_balance,
        updated_at = NOW()
    WHERE worker_id = v_booking.worker_id;
  END IF;

  -- Log the online credit transaction
  INSERT INTO public.wallet_transactions (
    worker_id, type, amount, balance_after, booking_id, description
  ) VALUES (
    v_booking.worker_id,
    'online_credit',
    v_worker_credit,
    COALESCE(v_new_balance, v_worker_credit),
    p_booking_id,
    'Online payment received — full credit of ₹' || v_worker_credit || ' (zero commission) for booking #' || LEFT(p_booking_id::TEXT, 8)
  );

  -- Mark payment as processed and complete the booking
  UPDATE public.bookings
  SET commission_deducted = TRUE,
      payment_status = 'paid',
      status = 'completed',
      updated_at = NOW()
  WHERE id = p_booking_id;

  -- Update active bookings
  DELETE FROM public.active_bookings WHERE booking_id = p_booking_id;

  -- Set worker status to online (FIX: was 'available')
  INSERT INTO public.worker_availability (worker_id, status, last_active_at, current_booking_id)
  VALUES (v_booking.worker_id, 'online', NOW(), NULL)
  ON CONFLICT (worker_id) DO UPDATE 
  SET status = 'online', last_active_at = NOW(), current_booking_id = NULL;

  RETURN jsonb_build_object(
    'success', true,
    'credited', v_worker_credit,
    'new_balance', COALESCE(v_new_balance, v_worker_credit)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
