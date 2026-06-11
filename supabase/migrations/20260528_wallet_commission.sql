-- ============================================================
-- Zolvo Wallet Commission Engine Migration
-- Run this in Supabase SQL Editor
-- ============================================================

-- 1. Add commission-related columns to bookings
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS payment_method TEXT DEFAULT 'cash',
  ADD COLUMN IF NOT EXISTS service_charge NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS material_charge NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discount_amount NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS commission_rate NUMERIC DEFAULT 0.10,
  ADD COLUMN IF NOT EXISTS commission_amount NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS commission_deducted BOOLEAN DEFAULT FALSE;

-- 2. Add commission_rate config to platform_config
INSERT INTO public.platform_config (key, value, description)
VALUES
  ('commission_rate', '0.10', 'Platform commission rate on service charge (default 10%)'),
  ('min_wallet_balance', '500', 'Minimum wallet balance required for worker to go online'),
  ('online_payment_discount', '0.05', 'Discount applied for online payments (default 5%)')
ON CONFLICT (key) DO NOTHING;

-- 3. Create wallet_transactions ledger table
CREATE TABLE IF NOT EXISTS public.wallet_transactions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  worker_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('credit', 'debit', 'commission', 'adjustment', 'recharge', 'online_credit')),
  amount NUMERIC NOT NULL,
  balance_after NUMERIC NOT NULL,
  booking_id UUID REFERENCES public.bookings(id) ON DELETE SET NULL,
  description TEXT,
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS on wallet_transactions
ALTER TABLE public.wallet_transactions ENABLE ROW LEVEL SECURITY;

-- Workers can view own transactions
CREATE POLICY "Workers can view own wallet transactions" ON public.wallet_transactions
  FOR SELECT USING (auth.uid() = worker_id);

-- Only admins or backend service role can insert transactions
CREATE POLICY "Admins can manage all wallet transactions" ON public.wallet_transactions
  FOR ALL USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

-- Index for performance
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_worker ON public.wallet_transactions (worker_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_booking ON public.wallet_transactions (booking_id);

-- 4. Atomic function: process commission after cash booking completion
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

  -- Calculate commission on service_charge only (NOT material_charge)
  v_commission := ROUND(COALESCE(v_booking.service_charge, v_booking.total_price) * v_commission_rate, 2);

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
    'Platform commission (10%) on service charge for booking #' || LEFT(p_booking_id::TEXT, 8)
  );

  -- Mark commission as deducted on booking
  UPDATE public.bookings
  SET commission_deducted = TRUE,
      commission_amount = v_commission,
      updated_at = NOW()
  WHERE id = p_booking_id;

  RETURN jsonb_build_object(
    'success', true,
    'commission', v_commission,
    'new_balance', v_new_balance
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Atomic function: process online payment credit to worker wallet
CREATE OR REPLACE FUNCTION public.process_online_payment_credit(p_booking_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_booking RECORD;
  v_wallet RECORD;
  v_new_balance NUMERIC;
  v_worker_credit NUMERIC;
BEGIN
  -- Fetch and lock booking
  SELECT b.id, b.worker_id, b.total_price, b.service_charge, b.payment_method,
         b.discount_amount, b.commission_deducted, b.status
  INTO v_booking
  FROM public.bookings b
  WHERE b.id = p_booking_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking not found: %', p_booking_id;
  END IF;

  IF v_booking.payment_method != 'online' THEN
    RETURN jsonb_build_object('success', false, 'reason', 'This function is only for online payments');
  END IF;

  IF v_booking.commission_deducted THEN
    RETURN jsonb_build_object('success', false, 'reason', 'Payment already processed');
  END IF;

  IF v_booking.worker_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'reason', 'No worker assigned');
  END IF;

  -- Worker receives full service amount (no commission for online payments)
  v_worker_credit := COALESCE(v_booking.service_charge, v_booking.total_price);

  -- Fetch and lock wallet
  SELECT balance INTO v_wallet
  FROM public.worker_wallets
  WHERE worker_id = v_booking.worker_id
  FOR UPDATE;

  v_new_balance := COALESCE(v_wallet.balance, 0) + v_worker_credit;

  -- Credit worker wallet
  UPDATE public.worker_wallets
  SET balance = v_new_balance,
      updated_at = NOW()
  WHERE worker_id = v_booking.worker_id;

  -- Log the online credit transaction
  INSERT INTO public.wallet_transactions (
    worker_id, type, amount, balance_after, booking_id, description
  ) VALUES (
    v_booking.worker_id,
    'online_credit',
    v_worker_credit,
    v_new_balance,
    p_booking_id,
    'Online payment received — full credit, no commission for booking #' || LEFT(p_booking_id::TEXT, 8)
  );

  -- Mark payment as processed
  UPDATE public.bookings
  SET commission_deducted = TRUE,
      payment_status = 'paid',
      status = 'paid_completed',
      updated_at = NOW()
  WHERE id = p_booking_id;

  RETURN jsonb_build_object(
    'success', true,
    'credited', v_worker_credit,
    'new_balance', v_new_balance
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. Admin credit/debit function for manual adjustments
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
  -- Verify caller is admin
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_admin_id AND role = 'admin') THEN
    RAISE EXCEPTION 'Unauthorized: admin role required';
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
    -- Auto-create wallet if missing
    INSERT INTO public.worker_wallets (worker_id, balance, currency, updated_at)
    VALUES (p_worker_id, 0, 'INR', NOW());
    v_wallet.balance := 0;
  END IF;

  -- Apply adjustment
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
