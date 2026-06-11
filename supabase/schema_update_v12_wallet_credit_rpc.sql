-- ============================================================
-- Zolvo Schema Update v12 — Wallet Credit RPC + Withdrawal Requests
-- Run this in your Supabase SQL Editor
-- ============================================================

-- 1. Create credit_worker_wallet RPC (atomic, SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.credit_worker_wallet(
  p_worker_id    UUID,
  p_amount       NUMERIC,
  p_description  TEXT DEFAULT 'Credit',
  p_reference_id TEXT DEFAULT NULL,
  p_type         TEXT DEFAULT 'recharge'
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_new_balance NUMERIC;
BEGIN
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Credit amount must be positive';
  END IF;

  -- Upsert wallet — create if first-time, update if exists
  INSERT INTO public.worker_wallets (worker_id, balance, currency, updated_at)
  VALUES (p_worker_id, p_amount, 'INR', NOW())
  ON CONFLICT (worker_id) DO UPDATE
    SET balance     = worker_wallets.balance + p_amount,
        updated_at  = NOW()
  RETURNING balance INTO v_new_balance;

  -- Insert ledger entry
  INSERT INTO public.wallet_transactions (
    worker_id, type, amount, balance_after, description, reference_id
  ) VALUES (
    p_worker_id, p_type, p_amount, v_new_balance, p_description, p_reference_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.credit_worker_wallet TO service_role;

-- 2. Create withdrawal_requests table
CREATE TABLE IF NOT EXISTS public.withdrawal_requests (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  worker_id    UUID NOT NULL REFERENCES public.workers(id) ON DELETE CASCADE,
  amount       NUMERIC NOT NULL CHECK (amount > 0),
  method       TEXT NOT NULL DEFAULT 'bank', -- 'bank' | 'upi'
  status       TEXT NOT NULL DEFAULT 'pending',
    -- pending | processing | approved | rejected | completed
  reference_id TEXT,
  notes        JSONB DEFAULT '{}',
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

-- RLS
ALTER TABLE public.withdrawal_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Workers can view own withdrawal requests" ON public.withdrawal_requests;
CREATE POLICY "Workers can view own withdrawal requests"
  ON public.withdrawal_requests FOR SELECT
  USING (auth.uid() = worker_id);

DROP POLICY IF EXISTS "Admins can manage all withdrawal requests" ON public.withdrawal_requests;
CREATE POLICY "Admins can manage all withdrawal requests"
  ON public.withdrawal_requests FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Indexes
CREATE INDEX IF NOT EXISTS idx_withdrawal_requests_worker
  ON public.withdrawal_requests (worker_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_withdrawal_requests_status
  ON public.withdrawal_requests (status);

SELECT 'Schema v12 applied: credit_worker_wallet RPC + withdrawal_requests table created.' AS status;
