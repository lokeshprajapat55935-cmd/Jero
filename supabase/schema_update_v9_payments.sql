/**
 * Supabase Database Schema - Phase 3 Part 9: Payment Infrastructure
 */

-- Payment Transactions
CREATE TABLE IF NOT EXISTS public.payment_transactions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  worker_id UUID REFERENCES public.workers(id) NOT NULL,
  amount NUMERIC NOT NULL,
  currency TEXT DEFAULT 'USD',
  status TEXT NOT NULL, -- 'pending', 'succeeded', 'failed', 'refunded'
  provider TEXT NOT NULL, -- e.g., 'stripe'
  provider_tx_id TEXT UNIQUE, -- ID from payment gateway
  description TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Webhook Events (for logging and audit)
CREATE TABLE IF NOT EXISTS public.webhook_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  provider TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  processed BOOLEAN DEFAULT FALSE,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.payment_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Workers can view own transactions" ON public.payment_transactions 
  FOR SELECT USING (auth.uid() = worker_id);

-- Indexes
CREATE INDEX idx_payment_transactions_worker ON public.payment_transactions(worker_id);
CREATE INDEX idx_payment_transactions_provider_id ON public.payment_transactions(provider_tx_id);
