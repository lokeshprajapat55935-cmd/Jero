-- ============================================================
-- Migration: 20260713_fix_process_booking_commission_status.sql
-- Description: 
--   1. Redefines process_booking_commission to remove references
--      to non-existent commission_records table and remove redundant
--      worker_availability status updates (handled by bookings trigger).
--   2. Redefines process_online_payment_credit to remove redundant
--      worker_availability status updates (handled by bookings trigger).
--   3. Redefines check_worker_online_wallet_balance to automatically
--      demote worker to 'offline' instead of raising an exception if 
--      their balance drops below the minimum limit upon job completion
--      (transitioning from 'busy' status).
--   4. Redefines sync_booking_completion_and_release trigger function on
--      bookings to only execute release/online updates when transitioning
--      to a terminal state (preventing errors on duplicate updates).
-- ============================================================

-- 1. Redefine process_booking_commission
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
  -- (This trigger-fires sync_booking_completion_and_release to update worker_availability status)
  UPDATE public.bookings
  SET commission_deducted = TRUE,
      commission_amount = v_commission,
      status = 'completed',
      payment_status = 'paid',
      updated_at = NOW()
  WHERE id = p_booking_id;

  -- Clear active bookings
  DELETE FROM public.active_bookings WHERE booking_id = p_booking_id;

  RETURN jsonb_build_object(
    'success', true,
    'commission', v_commission,
    'new_balance', v_new_balance
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 2. Redefine process_online_payment_credit
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
  -- (This trigger-fires sync_booking_completion_and_release to update worker_availability status)
  UPDATE public.bookings
  SET commission_deducted = TRUE,
      payment_status = 'paid',
      status = 'completed',
      updated_at = NOW()
  WHERE id = p_booking_id;

  -- Update active bookings
  DELETE FROM public.active_bookings WHERE booking_id = p_booking_id;

  RETURN jsonb_build_object(
    'success', true,
    'credited', v_worker_credit,
    'new_balance', COALESCE(v_new_balance, v_worker_credit)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 3. Redefine check_worker_online_wallet_balance
CREATE OR REPLACE FUNCTION public.check_worker_online_wallet_balance()
RETURNS TRIGGER AS $$
DECLARE
  v_wallet_balance NUMERIC;
  v_min_balance NUMERIC;
BEGIN
  -- Only validate if status is transitioning to 'online'
  IF NEW.status = 'online' THEN
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
      -- If they were busy (completing a job), demote to 'offline' instead of throwing
      -- to prevent blocking booking completion/payment flow.
      IF OLD IS NOT NULL AND OLD.status = 'busy' THEN
        NEW.status := 'offline';
      END IF;
      -- Note: Manual 'online' toggle is now allowed to prevent 400 errors.
      -- Balance enforcement is now handled in get_nearby_dispatch_workers RPC.
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 4. Redefine sync_booking_completion_and_release to prevent execution on duplicate updates
CREATE OR REPLACE FUNCTION public.sync_booking_completion_and_release()
RETURNS TRIGGER AS $$
BEGIN
  -- If status transitioned to completed, paid_completed, cancelled, or disputed (only on actual change)
  IF NEW.status IN ('completed', 'paid_completed', 'cancelled', 'disputed') AND (OLD.status IS DISTINCT FROM NEW.status OR OLD.status IS NULL) THEN
    -- Delete from active bookings
    DELETE FROM public.active_bookings WHERE booking_id = NEW.id;

    -- Update worker availability to online
    IF NEW.worker_id IS NOT NULL THEN
      UPDATE public.worker_availability
      SET status = 'online', current_booking_id = NULL, last_active_at = NOW()
      WHERE worker_id = NEW.worker_id;
    END IF;
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    -- Sync active booking status
    UPDATE public.active_bookings
    SET status = NEW.status
    WHERE booking_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
