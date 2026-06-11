-- ============================================================
-- Zolvo Locked Payment-Method Architecture Migration
-- Run this in Supabase SQL Editor
-- ============================================================

-- Add payment lock & audit columns to public.bookings
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS payment_locked BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS payment_reference TEXT,
  ADD COLUMN IF NOT EXISTS payment_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS payment_completed_at TIMESTAMPTZ;

-- Audit table for payment transactions (UPI/Card/Cash)
CREATE TABLE IF NOT EXISTS public.payment_transactions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  booking_id UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES public.profiles(id),
  worker_id UUID REFERENCES public.profiles(id),
  payment_method TEXT NOT NULL CHECK (payment_method IN ('cash', 'upi', 'card')),
  payment_status TEXT NOT NULL CHECK (payment_status IN ('pending', 'processing', 'paid', 'failed')),
  amount NUMERIC NOT NULL,
  reference_id TEXT,
  error_message TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS on payment_transactions
ALTER TABLE public.payment_transactions ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view own transactions
CREATE POLICY "Users can view own transactions" ON public.payment_transactions
  FOR SELECT USING (auth.uid() = client_id OR auth.uid() = worker_id);

-- Policy: Admins can manage all transactions
CREATE POLICY "Admins can manage all transactions" ON public.payment_transactions
  FOR ALL USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

-- Index for payment lookups
CREATE INDEX IF NOT EXISTS idx_payment_transactions_booking ON public.payment_transactions(booking_id);
