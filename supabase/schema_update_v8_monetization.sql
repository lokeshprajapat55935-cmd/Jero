/**
 * Supabase Database Schema - Phase 3 Part 8: Monetization System
 */

-- Subscription Plans
CREATE TABLE IF NOT EXISTS public.subscription_plans (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL, -- 'free', 'basic', 'premium'
  monthly_lead_credits INTEGER NOT NULL,
  price_amount NUMERIC NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Worker Subscriptions
CREATE TABLE IF NOT EXISTS public.worker_subscriptions (
  worker_id UUID REFERENCES public.workers(id) PRIMARY KEY,
  plan_id UUID REFERENCES public.subscription_plans(id) NOT NULL,
  status TEXT DEFAULT 'active', -- active, cancelled, expired
  current_period_end TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Lead Unlocks (tracks which worker unlocked which request)
CREATE TABLE IF NOT EXISTS public.lead_unlocks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  worker_id UUID REFERENCES public.workers(id) NOT NULL,
  request_id UUID NOT NULL, -- Reference to the service request
  unlocked_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT unique_worker_request_unlock UNIQUE(worker_id, request_id)
);

-- Usage Tracking (remaining credits for the current cycle)
CREATE TABLE IF NOT EXISTS public.worker_usage (
  worker_id UUID REFERENCES public.workers(id) PRIMARY KEY,
  remaining_credits INTEGER NOT NULL,
  last_reset_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.worker_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_unlocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.worker_usage ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Public plans are viewable" ON public.subscription_plans FOR SELECT USING (true);
CREATE POLICY "Workers can view own subscription" ON public.worker_subscriptions FOR SELECT USING (auth.uid() = worker_id);
CREATE POLICY "Workers can view own unlocks" ON public.lead_unlocks FOR SELECT USING (auth.uid() = worker_id);
CREATE POLICY "Workers can unlock leads" ON public.lead_unlocks FOR INSERT WITH CHECK (auth.uid() = worker_id);
CREATE POLICY "Workers can view own usage" ON public.worker_usage FOR SELECT USING (auth.uid() = worker_id);

-- Indexes
CREATE INDEX idx_lead_unlocks_worker ON public.lead_unlocks(worker_id);
CREATE INDEX idx_worker_subscriptions_status ON public.worker_subscriptions(status);
