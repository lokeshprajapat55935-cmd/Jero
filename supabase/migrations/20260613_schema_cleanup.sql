-- ============================================================
-- Migration: Schema Cleanup & Stability Fixes
-- Description:
-- 1. Drops duplicate city_id and area_id from public.workers.
-- 2. Fixes worker_id foreign keys to point to workers(id) instead of profiles(id).
-- 3. Adds missing foreign key indexes.
-- 4. Enforces worker_wallets CHECK (balance >= 0).
-- 5. Patches debit_worker_wallet RPC to enforce minimum 500 balance.
-- 6. Fixes booking state transitions from awaiting_item_approval.
-- ============================================================

-- 1. Ensure worker-related tables exist to prevent missing relation errors
CREATE TABLE IF NOT EXISTS public.worker_documents (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  worker_id UUID NOT NULL REFERENCES public.workers(id) ON DELETE CASCADE,
  document_type TEXT NOT NULL,
  document_url TEXT NOT NULL,
  verified BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.worker_wallets (
  worker_id UUID PRIMARY KEY REFERENCES public.workers(id) ON DELETE CASCADE,
  balance NUMERIC NOT NULL DEFAULT 0.00,
  currency TEXT DEFAULT 'INR',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.worker_locations (
  worker_id UUID PRIMARY KEY REFERENCES public.workers(id) ON DELETE CASCADE,
  latitude NUMERIC,
  longitude NUMERIC,
  city_id UUID REFERENCES public.cities(id),
  area_id UUID REFERENCES public.areas(id),
  last_active_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.worker_status_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  worker_id UUID NOT NULL REFERENCES public.workers(id) ON DELETE CASCADE,
  old_status TEXT,
  new_status TEXT NOT NULL,
  reason TEXT,
  changed_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.worker_service_categories (
  worker_id UUID REFERENCES public.workers(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  PRIMARY KEY (worker_id, category)
);

CREATE TABLE IF NOT EXISTS public.wallet_transactions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  worker_id UUID NOT NULL REFERENCES public.workers(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  amount NUMERIC NOT NULL,
  balance_after NUMERIC NOT NULL,
  booking_id UUID REFERENCES public.bookings(id) ON DELETE SET NULL,
  reference_id TEXT,
  description TEXT,
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 1b. Drop duplicate geography columns from public.workers
ALTER TABLE public.workers DROP COLUMN IF EXISTS city_id;
ALTER TABLE public.workers DROP COLUMN IF EXISTS area_id;

-- 2. Add CHECK constraint to worker_wallets
ALTER TABLE public.worker_wallets ADD CONSTRAINT worker_wallets_balance_check CHECK (balance >= 0);

-- 3. Fix foreign keys dynamically
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (
        SELECT tc.constraint_name, tc.table_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON tc.constraint_name = kcu.constraint_name
          AND tc.table_schema = kcu.table_schema
        WHERE tc.constraint_type = 'FOREIGN KEY'
          AND kcu.column_name = 'worker_id'
          AND tc.table_name IN ('worker_documents', 'worker_wallets', 'worker_locations', 'worker_status_logs', 'worker_service_categories')
    ) LOOP
        EXECUTE 'ALTER TABLE public.' || quote_ident(r.table_name) || ' DROP CONSTRAINT ' || quote_ident(r.constraint_name);
        EXECUTE 'ALTER TABLE public.' || quote_ident(r.table_name) || ' ADD CONSTRAINT ' || quote_ident(r.table_name || '_worker_id_fkey') || ' FOREIGN KEY (worker_id) REFERENCES public.workers(id) ON DELETE CASCADE';
    END LOOP;
END $$;

-- 4. Add Missing Indexes
CREATE INDEX IF NOT EXISTS idx_worker_documents_worker ON public.worker_documents(worker_id);
CREATE INDEX IF NOT EXISTS idx_worker_status_logs_worker ON public.worker_status_logs(worker_id);
CREATE INDEX IF NOT EXISTS idx_worker_locations_geo_dispatch ON public.worker_locations(city_id, area_id, last_active_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_bookings_scheduled_at ON public.bookings(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_bookings_worker_id ON public.bookings(worker_id);
CREATE INDEX IF NOT EXISTS idx_bookings_client_id ON public.bookings(client_id);

-- 5. Fix debit_worker_wallet RPC
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

  -- Enforce minimum balance of 500 for platform health
  IF (v_current_balance - p_amount) < 500 THEN
    RAISE EXCEPTION 'Insufficient balance. Must maintain ₹500 in wallet.';
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

-- 6. Fix Booking State Transitions
CREATE OR REPLACE FUNCTION validate_booking_state_transition()
RETURNS trigger AS $$
BEGIN
  -- If status hasn't changed, allow the update
  IF OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  -- Allowed transition paths:
  IF OLD.status = 'pending' AND NEW.status NOT IN ('accepted', 'cancelled') THEN
    RAISE EXCEPTION 'Invalid transition from pending to %', NEW.status;
  ELSIF OLD.status = 'accepted' AND NEW.status NOT IN ('worker_arriving', 'cancelled') THEN
    RAISE EXCEPTION 'Invalid transition from accepted to %', NEW.status;
  ELSIF OLD.status = 'worker_arriving' AND NEW.status NOT IN ('arrived', 'cancelled') THEN
    RAISE EXCEPTION 'Invalid transition from worker_arriving to %', NEW.status;
  ELSIF OLD.status = 'arrived' AND NEW.status NOT IN ('work_started', 'cancelled') THEN
    RAISE EXCEPTION 'Invalid transition from arrived to %', NEW.status;
  ELSIF OLD.status = 'work_started' AND NEW.status NOT IN ('work_completed', 'disputed') THEN
    RAISE EXCEPTION 'Invalid transition from work_started to %', NEW.status;
  ELSIF OLD.status = 'work_completed' AND NEW.status NOT IN ('awaiting_item_approval') THEN
    RAISE EXCEPTION 'Invalid transition from work_completed to %', NEW.status;
  ELSIF OLD.status = 'awaiting_item_approval' AND NEW.status NOT IN ('item_approved', 'disputed', 'cancelled') THEN
    RAISE EXCEPTION 'Invalid transition from awaiting_item_approval to %', NEW.status;
  ELSIF OLD.status = 'item_approved' AND NEW.status NOT IN ('otp_generated', 'disputed', 'cancelled') THEN
    RAISE EXCEPTION 'Invalid transition from item_approved to %', NEW.status;
  ELSIF OLD.status = 'otp_generated' AND NEW.status NOT IN ('awaiting_otp', 'disputed') THEN
    RAISE EXCEPTION 'Invalid transition from otp_generated to %', NEW.status;
  ELSIF OLD.status = 'awaiting_otp' AND NEW.status NOT IN ('otp_verified', 'disputed') THEN
    RAISE EXCEPTION 'Invalid transition from awaiting_otp to %', NEW.status;
  ELSIF OLD.status = 'otp_verified' AND NEW.status NOT IN ('awaiting_payment', 'disputed') THEN
    RAISE EXCEPTION 'Invalid transition from otp_verified to %', NEW.status;
  ELSIF OLD.status = 'awaiting_payment' AND NEW.status NOT IN ('payment_processing', 'completed', 'failed', 'disputed') THEN
    RAISE EXCEPTION 'Invalid transition from awaiting_payment to %', NEW.status;
  ELSIF OLD.status = 'payment_processing' AND NEW.status NOT IN ('completed', 'failed', 'disputed') THEN
    RAISE EXCEPTION 'Invalid transition from payment_processing to %', NEW.status;
  ELSIF OLD.status IN ('completed', 'cancelled', 'failed') THEN
    RAISE EXCEPTION 'Cannot transition from terminal state %', OLD.status;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
