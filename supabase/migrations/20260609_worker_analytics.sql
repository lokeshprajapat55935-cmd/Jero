-- ============================================================
-- Worker Analytics & Performance Schema
-- Migration: 20260609_worker_analytics.sql
-- ============================================================

-- 1. Worker analytics cache table (materialized daily)
CREATE TABLE IF NOT EXISTS public.worker_analytics_cache (
  worker_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  total_earnings_lifetime NUMERIC DEFAULT 0,
  total_jobs_lifetime INTEGER DEFAULT 0,
  total_commission_lifetime NUMERIC DEFAULT 0,
  acceptance_rate NUMERIC DEFAULT 100,
  completion_rate NUMERIC DEFAULT 100,
  cancellation_rate NUMERIC DEFAULT 0,
  avg_response_time_seconds INTEGER DEFAULT 0,
  fraud_score INTEGER DEFAULT 0,
  fraud_risk TEXT DEFAULT 'low' CHECK (fraud_risk IN ('low', 'medium', 'high')),
  last_computed_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.worker_analytics_cache ENABLE ROW LEVEL SECURITY;

-- Workers can see own analytics
CREATE POLICY "Workers can view own analytics" ON public.worker_analytics_cache
  FOR SELECT USING (auth.uid() = worker_id);

-- Only service role or admins can upsert
CREATE POLICY "Admins can manage analytics cache" ON public.worker_analytics_cache
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- 2. Worker penalties table
CREATE TABLE IF NOT EXISTS public.worker_penalties (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  worker_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  penalty_type TEXT NOT NULL CHECK (penalty_type IN (
    'warning', 'temporary_suspension', 'permanent_ban', 'wallet_freeze', 'dispatch_throttle'
  )),
  reason TEXT NOT NULL,
  evidence JSONB DEFAULT '{}',
  severity TEXT NOT NULL DEFAULT 'low' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'resolved', 'appealed')),
  expires_at TIMESTAMPTZ, -- NULL = permanent
  imposed_by UUID REFERENCES public.profiles(id),
  resolved_by UUID REFERENCES public.profiles(id),
  resolved_at TIMESTAMPTZ,
  resolution_note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.worker_penalties ENABLE ROW LEVEL SECURITY;

-- Workers can see their own penalties
CREATE POLICY "Workers can view own penalties" ON public.worker_penalties
  FOR SELECT USING (auth.uid() = worker_id);

-- Admins manage all penalties
CREATE POLICY "Admins manage penalties" ON public.worker_penalties
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- 3. Indexes for performance
CREATE INDEX IF NOT EXISTS idx_worker_penalties_worker ON public.worker_penalties(worker_id, status);
CREATE INDEX IF NOT EXISTS idx_worker_penalties_type ON public.worker_penalties(penalty_type, status);
CREATE INDEX IF NOT EXISTS idx_worker_penalties_severity ON public.worker_penalties(severity, status);

-- 4. Function: compute and upsert worker analytics
CREATE OR REPLACE FUNCTION public.compute_worker_analytics(p_worker_id UUID)
RETURNS VOID AS $$
DECLARE
  v_total_earnings NUMERIC := 0;
  v_total_jobs INTEGER := 0;
  v_total_commission NUMERIC := 0;
  v_total_dispatched INTEGER := 0;
  v_total_accepted INTEGER := 0;
  v_total_started INTEGER := 0;
  v_total_completed INTEGER := 0;
  v_total_cancelled INTEGER := 0;
  v_fraud_score INTEGER := 0;
  v_fraud_risk TEXT := 'low';
  v_acceptance_rate NUMERIC := 100;
  v_completion_rate NUMERIC := 100;
  v_cancellation_rate NUMERIC := 0;
BEGIN
  -- Compute earnings from completed bookings
  SELECT
    COALESCE(SUM(total_price), 0),
    COUNT(*),
    COALESCE(SUM(commission_amount), 0)
  INTO v_total_earnings, v_total_jobs, v_total_commission
  FROM public.bookings
  WHERE worker_id = p_worker_id
    AND status IN ('completed', 'paid_completed');

  -- Compute dispatch stats
  SELECT COUNT(*) INTO v_total_dispatched
  FROM public.dispatch_attempts
  WHERE worker_id = p_worker_id;

  SELECT COUNT(*) INTO v_total_accepted
  FROM public.dispatch_attempts
  WHERE worker_id = p_worker_id AND status = 'accepted';

  -- Compute booking stats
  SELECT COUNT(*) INTO v_total_started
  FROM public.bookings
  WHERE worker_id = p_worker_id
    AND status IN ('work_started', 'work_completed', 'awaiting_item_approval', 'item_approved',
                   'otp_generated', 'otp_verified', 'awaiting_payment', 'payment_processing',
                   'payment_verified', 'completed', 'paid_completed');

  SELECT COUNT(*) INTO v_total_completed
  FROM public.bookings
  WHERE worker_id = p_worker_id AND status IN ('completed', 'paid_completed');

  SELECT COUNT(*) INTO v_total_cancelled
  FROM public.bookings
  WHERE worker_id = p_worker_id AND status = 'cancelled';

  -- Compute rates
  IF v_total_dispatched > 0 THEN
    v_acceptance_rate := ROUND((v_total_accepted::NUMERIC / v_total_dispatched) * 100);
  END IF;

  IF v_total_started > 0 THEN
    v_completion_rate := ROUND((v_total_completed::NUMERIC / v_total_started) * 100);
  END IF;

  IF v_total_jobs + v_total_cancelled > 0 THEN
    v_cancellation_rate := ROUND((v_total_cancelled::NUMERIC / (v_total_jobs + v_total_cancelled)) * 100);
  END IF;

  -- Compute fraud score
  v_fraud_score := 0;
  IF v_cancellation_rate > 20 THEN v_fraud_score := v_fraud_score + 25; END IF;
  IF v_acceptance_rate < 50 THEN v_fraud_score := v_fraud_score + 30; END IF;
  IF v_acceptance_rate < 30 THEN v_fraud_score := v_fraud_score + 20; END IF;

  v_fraud_score := LEAST(100, v_fraud_score);
  IF v_fraud_score >= 50 THEN v_fraud_risk := 'high';
  ELSIF v_fraud_score >= 25 THEN v_fraud_risk := 'medium';
  ELSE v_fraud_risk := 'low';
  END IF;

  -- Upsert analytics cache
  INSERT INTO public.worker_analytics_cache (
    worker_id, total_earnings_lifetime, total_jobs_lifetime, total_commission_lifetime,
    acceptance_rate, completion_rate, cancellation_rate,
    fraud_score, fraud_risk, last_computed_at, updated_at
  )
  VALUES (
    p_worker_id, v_total_earnings, v_total_jobs, v_total_commission,
    v_acceptance_rate, v_completion_rate, v_cancellation_rate,
    v_fraud_score, v_fraud_risk, NOW(), NOW()
  )
  ON CONFLICT (worker_id) DO UPDATE SET
    total_earnings_lifetime = EXCLUDED.total_earnings_lifetime,
    total_jobs_lifetime = EXCLUDED.total_jobs_lifetime,
    total_commission_lifetime = EXCLUDED.total_commission_lifetime,
    acceptance_rate = EXCLUDED.acceptance_rate,
    completion_rate = EXCLUDED.completion_rate,
    cancellation_rate = EXCLUDED.cancellation_rate,
    fraud_score = EXCLUDED.fraud_score,
    fraud_risk = EXCLUDED.fraud_risk,
    last_computed_at = NOW(),
    updated_at = NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Trigger: auto-compute analytics when booking completes
CREATE OR REPLACE FUNCTION public.trigger_recompute_worker_analytics()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status IN ('completed', 'paid_completed', 'cancelled') AND
     NEW.worker_id IS NOT NULL THEN
    PERFORM public.compute_worker_analytics(NEW.worker_id);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER trigger_booking_analytics_recompute
  AFTER UPDATE OF status ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.trigger_recompute_worker_analytics();
