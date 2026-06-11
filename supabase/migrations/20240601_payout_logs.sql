-- ============================================================
-- Payout Logs Table — Required for Razorpay Payouts integration
-- Run this in the Supabase SQL editor
-- ============================================================

-- 1. Create payout_logs table
CREATE TABLE IF NOT EXISTS payout_logs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount          NUMERIC(10,2) NOT NULL CHECK (amount > 0),
  payment_method  TEXT NOT NULL CHECK (payment_method IN ('bank_transfer', 'upi')),
  status          TEXT NOT NULL DEFAULT 'processing' CHECK (status IN ('processing', 'completed', 'failed', 'reversed')),
  reference_id    TEXT,
  notes           JSONB DEFAULT '{}',
  created_at      TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at      TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- 2. Index for worker lookups
CREATE INDEX IF NOT EXISTS idx_payout_logs_worker_id ON payout_logs(worker_id);
CREATE INDEX IF NOT EXISTS idx_payout_logs_created_at ON payout_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payout_logs_reference_id ON payout_logs(reference_id);

-- 3. RLS policies
ALTER TABLE payout_logs ENABLE ROW LEVEL SECURITY;

-- Workers can view their own payouts
CREATE POLICY "Workers can view own payouts"
  ON payout_logs FOR SELECT
  USING (auth.uid() = worker_id);

-- Only server (admin) can insert/update payout_logs
-- (The API uses createAdminClient which bypasses RLS)
CREATE POLICY "Admin only insert"
  ON payout_logs FOR INSERT
  WITH CHECK (false);  -- Blocked from client; only admin client can insert

-- 4. Ensure wallet_transactions has a 'pending_recharge' type
-- Check if there's a constraint on the type column and update it
-- (Run only if needed — skip if type is unconstrained)
-- ALTER TABLE wallet_transactions DROP CONSTRAINT IF EXISTS wallet_transactions_type_check;
-- ALTER TABLE wallet_transactions ADD CONSTRAINT wallet_transactions_type_check 
--   CHECK (type IN ('credit', 'debit', 'commission', 'recharge', 'pending_recharge', 'online_credit', 'referral_bonus', 'welcome_bonus', 'refund'));

-- 5. debit_worker_wallet RPC (used by withdraw route, graceful fallback if missing)
CREATE OR REPLACE FUNCTION debit_worker_wallet(
  p_worker_id     UUID,
  p_amount        NUMERIC,
  p_description   TEXT DEFAULT 'Debit',
  p_reference_id  TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_current_balance NUMERIC;
  v_new_balance     NUMERIC;
BEGIN
  -- Lock the wallet row
  SELECT balance INTO v_current_balance
  FROM worker_wallets
  WHERE worker_id = p_worker_id
  FOR UPDATE;

  IF v_current_balance IS NULL THEN
    RAISE EXCEPTION 'Wallet not found for worker %', p_worker_id;
  END IF;

  IF v_current_balance < p_amount THEN
    RAISE EXCEPTION 'Insufficient balance. Current: %, Requested: %', v_current_balance, p_amount;
  END IF;

  v_new_balance := v_current_balance - p_amount;

  -- Update wallet balance
  UPDATE worker_wallets
  SET balance = v_new_balance, updated_at = now()
  WHERE worker_id = p_worker_id;

  -- Insert transaction record
  INSERT INTO wallet_transactions (worker_id, type, amount, description, reference_id, balance_after)
  VALUES (p_worker_id, 'debit', p_amount, p_description, p_reference_id, v_new_balance);
END;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION debit_worker_wallet TO authenticated;

SELECT 'Migration complete: payout_logs table and debit_worker_wallet RPC created successfully' AS status;
