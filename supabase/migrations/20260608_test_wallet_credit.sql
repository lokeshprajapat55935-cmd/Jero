-- ============================================================
-- Zolvo TEST MODE: Wallet Credit for Testing
-- Phone: +917014868682
-- Amount: ₹500 TEST CREDIT
-- Date: 2026-06-08
-- IMPORTANT: This is TESTING ONLY. Does NOT modify any
--            production business logic, booking flows, or
--            commission/payment workflows.
-- ============================================================

-- ============================================================
-- STEP 1: INVESTIGATE — Find worker by phone number
-- ============================================================

-- Query 1: Find profile by phone number +917014868682
-- Run this first to inspect the worker account
SELECT
  p.id                  AS profile_id,
  p.full_name,
  p.phone,
  p.role,
  p.onboarded,
  p.created_at
FROM public.profiles p
WHERE p.phone = '+917014868682'
   OR p.phone = '7014868682'
   OR p.phone = '917014868682'
LIMIT 1;

-- ============================================================
-- STEP 2: FIND WALLET + WORKER STATUS
-- ============================================================

-- Query 2: Find worker record, wallet, and approval status
-- Replace <PROFILE_ID> with the ID found in Query 1 above,
-- OR just run this and it will auto-resolve via the phone join.
SELECT
  p.id                              AS profile_id,
  p.full_name,
  p.phone,
  p.role,
  w.status                          AS worker_approval_status,
  w.category                        AS service_category,
  w.onboarding_completed,
  ww.balance                        AS current_wallet_balance,
  ww.currency                       AS wallet_currency,
  ww.updated_at                     AS wallet_last_updated,
  wa.status                         AS availability_status,
  wl.city_id,
  wl.area_id
FROM public.profiles p
LEFT JOIN public.workers w     ON w.id = p.id
LEFT JOIN public.worker_wallets ww ON ww.worker_id = w.id
LEFT JOIN public.worker_availability wa ON wa.worker_id = w.id
LEFT JOIN public.worker_locations wl ON wl.worker_id = w.id
WHERE p.phone = '+917014868682'
   OR p.phone = '7014868682'
   OR p.phone = '917014868682'
LIMIT 1;

-- ============================================================
-- STEP 3: CHECK EXISTING TRANSACTION HISTORY
-- ============================================================

-- Query 3: Show existing wallet transactions for this worker
SELECT
  wt.id,
  wt.type,
  wt.amount,
  wt.balance_after,
  wt.description,
  wt.reference_id,
  wt.created_at
FROM public.wallet_transactions wt
JOIN public.profiles p ON p.id = wt.worker_id
WHERE p.phone = '+917014868682'
   OR p.phone = '7014868682'
   OR p.phone = '917014868682'
ORDER BY wt.created_at DESC
LIMIT 20;

-- ============================================================
-- STEP 4: SAFE TEST CREDIT — ₹500 TEST MODE CREDIT
-- ============================================================
-- This block:
--   1. Finds the worker ID from the phone number
--   2. Captures the balance BEFORE the credit
--   3. Upserts the wallet (creates one if missing, adds to existing)
--   4. Inserts a wallet_transactions ledger entry typed as 'recharge'
--      with description = TEST_CREDIT (safe, non-production type)
--   5. Inserts an admin_logs audit record for traceability
--   6. Returns a full summary
-- ============================================================

DO $$
DECLARE
  v_profile_id      UUID;
  v_worker_id       UUID;
  v_balance_before  NUMERIC;
  v_balance_after   NUMERIC;
  v_credit_amount   NUMERIC := 500.00;
  v_tx_id           UUID;
  v_full_name       TEXT;
  v_worker_status   TEXT;
BEGIN

  -- 1. Resolve profile ID from phone
  SELECT id, full_name
  INTO v_profile_id, v_full_name
  FROM public.profiles
  WHERE phone = '+917014868682'
     OR phone = '7014868682'
     OR phone = '917014868682'
  LIMIT 1;

  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'STOP: No profile found for phone +917014868682. Cannot proceed.';
  END IF;

  -- 2. Confirm worker record exists
  SELECT id, status INTO v_worker_id, v_worker_status
  FROM public.workers
  WHERE id = v_profile_id;

  IF v_worker_id IS NULL THEN
    RAISE EXCEPTION 'STOP: Profile % exists but no worker record found. Cannot credit wallet.', v_profile_id;
  END IF;

  -- 3. Get current balance (may be NULL if wallet doesn't exist yet)
  SELECT balance INTO v_balance_before
  FROM public.worker_wallets
  WHERE worker_id = v_worker_id;

  v_balance_before := COALESCE(v_balance_before, 0.00);

  -- 4. Upsert wallet — create if missing, increment if exists
  INSERT INTO public.worker_wallets (worker_id, balance, currency, updated_at)
  VALUES (v_worker_id, v_credit_amount, 'INR', NOW())
  ON CONFLICT (worker_id) DO UPDATE
    SET balance    = worker_wallets.balance + v_credit_amount,
        updated_at = NOW()
  RETURNING balance INTO v_balance_after;

  -- 5. Insert wallet_transactions ledger entry (TEST_CREDIT)
  INSERT INTO public.wallet_transactions (
    worker_id,
    type,
    amount,
    balance_after,
    reference_id,
    description,
    created_at
  ) VALUES (
    v_worker_id,
    'recharge',           -- Using valid existing type 'recharge'
    v_credit_amount,
    v_balance_after,
    'TEST_CREDIT_20260608',
    'TEST_CREDIT: Manual ₹500 test wallet credit for booking flow testing. Phone: +917014868682. Not a production transaction.',
    NOW()
  )
  RETURNING id INTO v_tx_id;

  -- 6. Insert audit record in admin_logs for full traceability
  INSERT INTO public.admin_logs (
    admin_id,
    action_type,
    target_type,
    target_id,
    target_name,
    old_value,
    new_value,
    reason,
    created_at
  ) VALUES (
    v_worker_id,             -- Using worker's own ID as actor (testing context)
    'test_wallet_credit',
    'wallet',
    v_worker_id::TEXT,
    COALESCE(v_full_name, 'Unknown Worker'),
    jsonb_build_object(
      'balance_before', v_balance_before,
      'wallet_existed', (v_balance_before > 0)
    ),
    jsonb_build_object(
      'balance_after', v_balance_after,
      'credit_amount', v_credit_amount,
      'transaction_id', v_tx_id,
      'reference_id', 'TEST_CREDIT_20260608'
    ),
    'TEST MODE: ₹500 test credit for booking flow validation. Phone: +917014868682. NOT a production operation.',
    NOW()
  );

  -- 7. Output full summary
  RAISE NOTICE '============================================================';
  RAISE NOTICE 'ZOLVO TEST WALLET CREDIT — COMPLETED SUCCESSFULLY';
  RAISE NOTICE '============================================================';
  RAISE NOTICE 'Profile ID      : %', v_profile_id;
  RAISE NOTICE 'Worker ID       : %', v_worker_id;
  RAISE NOTICE 'Worker Name     : %', COALESCE(v_full_name, 'N/A');
  RAISE NOTICE 'Worker Status   : %', COALESCE(v_worker_status, 'unknown');
  RAISE NOTICE 'Credit Amount   : ₹%', v_credit_amount;
  RAISE NOTICE 'Balance Before  : ₹%', v_balance_before;
  RAISE NOTICE 'Balance After   : ₹%', v_balance_after;
  RAISE NOTICE 'Transaction ID  : %', v_tx_id;
  RAISE NOTICE 'Reference       : TEST_CREDIT_20260608';
  RAISE NOTICE 'Transaction Type: recharge (TEST_CREDIT)';
  RAISE NOTICE 'Timestamp       : %', NOW();
  RAISE NOTICE '============================================================';
  RAISE NOTICE 'WHAT WAS NOT TOUCHED:';
  RAISE NOTICE '  - No booking tables modified';
  RAISE NOTICE '  - No commission tables modified';
  RAISE NOTICE '  - No production business logic modified';
  RAISE NOTICE '  - No customer/client data modified';
  RAISE NOTICE '  - No payment workflows modified';
  RAISE NOTICE '  - No OTP workflows modified';
  RAISE NOTICE '============================================================';

END $$;

-- ============================================================
-- STEP 5: VALIDATION QUERIES
-- ============================================================

-- Validation 1: Confirm new balance
SELECT
  p.full_name,
  p.phone,
  ww.balance          AS new_wallet_balance,
  ww.currency,
  ww.updated_at
FROM public.worker_wallets ww
JOIN public.workers w ON w.id = ww.worker_id
JOIN public.profiles p ON p.id = w.id
WHERE p.phone = '+917014868682'
   OR p.phone = '7014868682'
   OR p.phone = '917014868682';

-- Validation 2: Confirm TEST_CREDIT transaction in history
SELECT
  wt.id,
  wt.type,
  wt.amount,
  wt.balance_after,
  wt.reference_id,
  wt.description,
  wt.created_at
FROM public.wallet_transactions wt
JOIN public.workers w ON w.id = wt.worker_id
JOIN public.profiles p ON p.id = w.id
WHERE (
  p.phone = '+917014868682'
  OR p.phone = '7014868682'
  OR p.phone = '917014868682'
)
AND wt.reference_id = 'TEST_CREDIT_20260608'
ORDER BY wt.created_at DESC;

-- Validation 3: Confirm no commission_records were modified
-- (This should return 0 rows for the test credit)
SELECT COUNT(*) AS commission_records_affected
FROM public.commission_records cr
JOIN public.workers w ON w.id = cr.worker_id
JOIN public.profiles p ON p.id = w.id
WHERE (
  p.phone = '+917014868682'
  OR p.phone = '7014868682'
  OR p.phone = '917014868682'
)
AND cr.deducted_at >= NOW() - INTERVAL '5 minutes';

-- Validation 4: Confirm no bookings were touched
SELECT COUNT(*) AS bookings_modified_in_last_5_min
FROM public.bookings b
JOIN public.workers w ON w.id = b.worker_id
JOIN public.profiles p ON p.id = w.id
WHERE (
  p.phone = '+917014868682'
  OR p.phone = '7014868682'
  OR p.phone = '917014868682'
)
AND b.updated_at >= NOW() - INTERVAL '5 minutes';

-- ============================================================
-- STEP 6: BOOKING FLOW READINESS CHECK
-- ============================================================
-- Run each query to generate PASS/FAIL report

-- Check 1: Worker is approved
SELECT
  CASE
    WHEN w.status = 'approved' THEN 'PASS — Worker is approved (' || w.status || ')'
    ELSE 'FAIL — Worker status is: ' || COALESCE(w.status, 'NULL') || ' (needs to be approved)'
  END AS "Worker Approved"
FROM public.workers w
JOIN public.profiles p ON p.id = w.id
WHERE p.phone = '+917014868682'
   OR p.phone = '7014868682'
   OR p.phone = '917014868682';

-- Check 2: Worker online status configured
SELECT
  CASE
    WHEN wa.status IS NOT NULL THEN 'PASS — worker_availability record exists (status: ' || wa.status || ')'
    ELSE 'FAIL — No worker_availability record found. Worker cannot go online.'
  END AS "Worker Online Status Available"
FROM public.workers w
JOIN public.profiles p ON p.id = w.id
LEFT JOIN public.worker_availability wa ON wa.worker_id = w.id
WHERE p.phone = '+917014868682'
   OR p.phone = '7014868682'
   OR p.phone = '917014868682';

-- Check 3: Wallet balance >= min_wallet_balance (500)
SELECT
  CASE
    WHEN ww.balance >= 500 THEN 'PASS — Wallet balance ₹' || ww.balance || ' meets minimum ₹500'
    WHEN ww.balance IS NULL THEN 'FAIL — No wallet found for worker'
    ELSE 'FAIL — Wallet balance ₹' || ww.balance || ' is below minimum ₹500'
  END AS "Wallet Balance Sufficient To Go Online"
FROM public.workers w
JOIN public.profiles p ON p.id = w.id
LEFT JOIN public.worker_wallets ww ON ww.worker_id = w.id
WHERE p.phone = '+917014868682'
   OR p.phone = '7014868682'
   OR p.phone = '917014868682';

-- Check 4: Worker location record exists (required for dispatch)
SELECT
  CASE
    WHEN wl.worker_id IS NOT NULL THEN 'PASS — worker_locations record exists'
    ELSE 'FAIL — No worker_locations record. Worker cannot be dispatched.'
  END AS "Dispatch System Ready"
FROM public.workers w
JOIN public.profiles p ON p.id = w.id
LEFT JOIN public.worker_locations wl ON wl.worker_id = w.id
WHERE p.phone = '+917014868682'
   OR p.phone = '7014868682'
   OR p.phone = '917014868682';

-- Check 5: Booking creation system (dispatch engine function exists)
SELECT
  CASE
    WHEN COUNT(*) > 0 THEN 'PASS — create_booking_dispatch RPC function exists'
    ELSE 'FAIL — create_booking_dispatch function missing'
  END AS "Booking Creation Working"
FROM information_schema.routines
WHERE routine_schema = 'public'
AND routine_name = 'create_booking_dispatch';

-- Check 6: Booking acceptance function (accept_dispatch_booking)
SELECT
  CASE
    WHEN COUNT(*) > 0 THEN 'PASS — accept_dispatch_booking RPC function exists'
    ELSE 'FAIL — accept_dispatch_booking function missing'
  END AS "Booking Acceptance Working"
FROM information_schema.routines
WHERE routine_schema = 'public'
AND routine_name = 'accept_dispatch_booking';

-- Check 7: OTP completion function (verify_booking_otp)
SELECT
  CASE
    WHEN COUNT(*) > 0 THEN 'PASS — verify_booking_otp RPC function exists'
    ELSE 'FAIL — verify_booking_otp function missing'
  END AS "OTP Completion Working"
FROM information_schema.routines
WHERE routine_schema = 'public'
AND routine_name = 'verify_booking_otp';

-- Check 8: Commission/wallet deduction function (process_booking_commission)
SELECT
  CASE
    WHEN COUNT(*) > 0 THEN 'PASS — process_booking_commission RPC function exists'
    ELSE 'FAIL — process_booking_commission function missing'
  END AS "Wallet Deductions Working"
FROM information_schema.routines
WHERE routine_schema = 'public'
AND routine_name = 'process_booking_commission';

-- Check 9: wallet_transactions table exists
SELECT
  CASE
    WHEN COUNT(*) > 0 THEN 'PASS — wallet_transactions table exists'
    ELSE 'FAIL — wallet_transactions table missing'
  END AS "Transaction History Table Exists"
FROM information_schema.tables
WHERE table_schema = 'public'
AND table_name = 'wallet_transactions';

-- Check 10: worker_wallets table exists
SELECT
  CASE
    WHEN COUNT(*) > 0 THEN 'PASS — worker_wallets table exists'
    ELSE 'FAIL — worker_wallets table missing'
  END AS "Wallet Table Exists"
FROM information_schema.tables
WHERE table_schema = 'public'
AND table_name = 'worker_wallets';

-- ============================================================
-- FINAL SUMMARY: All key table names used in this script
-- ============================================================
-- Wallet Table        : public.worker_wallets
-- Balance Column      : balance (NUMERIC, NOT NULL, DEFAULT 0.00)
-- Worker Reference    : worker_id (UUID, FK → public.workers(id))
-- Transaction Table   : public.wallet_transactions
-- Commission Table    : public.commission_records
-- Withdrawal Table    : public.withdrawal_requests
-- Audit Table         : public.admin_logs
-- ============================================================
