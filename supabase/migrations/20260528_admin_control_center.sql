-- ============================================================
-- Zolvo Admin Operations Control Center Migration
-- Run this in Supabase SQL Editor
-- ============================================================

-- 1. Admin Sub-Role on profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS admin_role TEXT DEFAULT NULL
    CHECK (admin_role IN ('super_admin', 'operations_admin', 'support_admin', 'finance_admin'));

-- Default all existing admins to super_admin
UPDATE public.profiles
  SET admin_role = 'super_admin'
  WHERE role = 'admin' AND admin_role IS NULL;

-- 2. Disputes table
CREATE TABLE IF NOT EXISTS public.disputes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  booking_id UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  raised_by UUID NOT NULL REFERENCES public.profiles(id),
  raised_against UUID REFERENCES public.profiles(id),
  dispute_type TEXT NOT NULL CHECK (dispute_type IN (
    'client_complaint', 'worker_complaint', 'payment_issue', 'fraud_report', 'otp_issue', 'quality_issue', 'other'
  )),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'under_review', 'resolved_client', 'resolved_worker', 'escalated', 'closed')),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  resolution_note TEXT,
  resolved_by UUID REFERENCES public.profiles(id),
  resolved_at TIMESTAMPTZ,
  priority TEXT DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.disputes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can manage all disputes" ON public.disputes;
CREATE POLICY "Admins can manage all disputes" ON public.disputes
  FOR ALL USING (EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
  ));

DROP POLICY IF EXISTS "Users can view own disputes" ON public.disputes;
CREATE POLICY "Users can view own disputes" ON public.disputes
  FOR SELECT USING (raised_by = auth.uid() OR raised_against = auth.uid());

CREATE INDEX IF NOT EXISTS idx_disputes_booking ON public.disputes (booking_id);
CREATE INDEX IF NOT EXISTS idx_disputes_status ON public.disputes (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_disputes_raised_by ON public.disputes (raised_by);

-- 3. Admin Audit Logs
CREATE TABLE IF NOT EXISTS public.admin_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  admin_id UUID NOT NULL REFERENCES public.profiles(id),
  action_type TEXT NOT NULL,   -- e.g. 'worker_approved', 'wallet_adjusted', 'dispute_resolved', 'booking_cancelled'
  target_type TEXT,            -- 'worker', 'client', 'booking', 'wallet', 'dispute', 'settings'
  target_id TEXT,              -- UUID or string of the affected record
  target_name TEXT,            -- Human-readable label (e.g. worker full name)
  old_value JSONB,             -- Previous state snapshot
  new_value JSONB,             -- New state snapshot
  reason TEXT,                 -- Admin-provided note/reason
  ip_address TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.admin_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can read audit logs" ON public.admin_logs;
CREATE POLICY "Admins can read audit logs" ON public.admin_logs
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
  ));

DROP POLICY IF EXISTS "Service role can insert audit logs" ON public.admin_logs;
CREATE POLICY "Service role can insert audit logs" ON public.admin_logs
  FOR INSERT WITH CHECK (TRUE);

CREATE INDEX IF NOT EXISTS idx_admin_logs_admin ON public.admin_logs (admin_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_logs_action ON public.admin_logs (action_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_logs_target ON public.admin_logs (target_type, target_id);

-- 4. Fraud Flags
CREATE TABLE IF NOT EXISTS public.fraud_flags (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(id),
  flag_type TEXT NOT NULL CHECK (flag_type IN (
    'suspicious_cancellation', 'fake_booking', 'wallet_abuse',
    'otp_failure_pattern', 'repeated_disputes', 'account_sharing', 'other'
  )),
  severity TEXT NOT NULL DEFAULT 'low' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'dismissed', 'escalated', 'actioned')),
  description TEXT NOT NULL,
  booking_id UUID REFERENCES public.bookings(id) ON DELETE SET NULL,
  evidence JSONB DEFAULT '{}',
  reviewed_by UUID REFERENCES public.profiles(id),
  reviewed_at TIMESTAMPTZ,
  review_note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.fraud_flags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can manage fraud flags" ON public.fraud_flags;
CREATE POLICY "Admins can manage fraud flags" ON public.fraud_flags
  FOR ALL USING (EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
  ));

CREATE INDEX IF NOT EXISTS idx_fraud_flags_user ON public.fraud_flags (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_fraud_flags_status ON public.fraud_flags (status, severity);

-- 5. Support Tickets
CREATE TABLE IF NOT EXISTS public.support_tickets (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(id),
  category TEXT NOT NULL CHECK (category IN (
    'booking_issue', 'payment_issue', 'account_issue', 'worker_complaint', 'app_bug', 'other'
  )),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  subject TEXT NOT NULL,
  description TEXT NOT NULL,
  booking_id UUID REFERENCES public.bookings(id) ON DELETE SET NULL,
  assigned_to UUID REFERENCES public.profiles(id),
  resolution_note TEXT,
  closed_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can manage support tickets" ON public.support_tickets;
CREATE POLICY "Admins can manage support tickets" ON public.support_tickets
  FOR ALL USING (EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
  ));

DROP POLICY IF EXISTS "Users can view own tickets" ON public.support_tickets;
CREATE POLICY "Users can view own tickets" ON public.support_tickets
  FOR SELECT USING (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_support_tickets_user ON public.support_tickets (user_id);
CREATE INDEX IF NOT EXISTS idx_support_tickets_status ON public.support_tickets (status, priority, created_at DESC);

-- 6. Payout Logs
CREATE TABLE IF NOT EXISTS public.payout_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  worker_id UUID NOT NULL REFERENCES public.profiles(id),
  amount NUMERIC NOT NULL,
  payment_method TEXT NOT NULL CHECK (payment_method IN ('bank_transfer', 'upi', 'wallet_credit')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  reference_id TEXT,
  notes TEXT,
  initiated_by UUID REFERENCES public.profiles(id),
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.payout_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can manage payout logs" ON public.payout_logs;
CREATE POLICY "Admins can manage payout logs" ON public.payout_logs
  FOR ALL USING (EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
  ));

DROP POLICY IF EXISTS "Workers can view own payouts" ON public.payout_logs;
CREATE POLICY "Workers can view own payouts" ON public.payout_logs
  FOR SELECT USING (worker_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_payout_logs_worker ON public.payout_logs (worker_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payout_logs_status ON public.payout_logs (status, created_at DESC);

-- 7. Admin Notifications (broadcasts from admin panel)
CREATE TABLE IF NOT EXISTS public.admin_notifications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  sent_by UUID NOT NULL REFERENCES public.profiles(id),
  target_type TEXT NOT NULL CHECK (target_type IN ('all_workers', 'all_clients', 'all_users', 'city', 'specific_user')),
  target_city_id UUID REFERENCES public.cities(id) ON DELETE SET NULL,
  target_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  notification_type TEXT NOT NULL DEFAULT 'info' CHECK (notification_type IN ('info', 'warning', 'announcement', 'urgent')),
  sent_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.admin_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can manage admin notifications" ON public.admin_notifications;
CREATE POLICY "Admins can manage admin notifications" ON public.admin_notifications
  FOR ALL USING (EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
  ));

CREATE INDEX IF NOT EXISTS idx_admin_notifications_sent_by ON public.admin_notifications (sent_by, created_at DESC);

-- 8. Add platform config entries for new settings
INSERT INTO public.platform_config (key, value, description)
VALUES
  ('platform_name', 'Zolvo', 'Platform display name'),
  ('support_phone', '+91-0000000000', 'Admin support contact phone'),
  ('max_booking_radius_km', '10', 'Maximum worker search radius in kilometers'),
  ('booking_auto_cancel_minutes', '15', 'Minutes before unaccepted booking is auto-cancelled'),
  ('fraud_otp_threshold', '3', 'Failed OTP attempts before fraud flag is raised'),
  ('fraud_cancellation_threshold', '5', 'Cancellations in 7 days before fraud flag is raised')
ON CONFLICT (key) DO NOTHING;

-- 9. Helper function: Get live platform snapshot (used by /api/admin/live)
CREATE OR REPLACE FUNCTION public.get_live_platform_snapshot()
RETURNS JSONB AS $$
DECLARE
  v_active_bookings INTEGER;
  v_online_workers INTEGER;
  v_open_disputes INTEGER;
  v_failed_payments INTEGER;
  v_today_revenue NUMERIC;
  v_today_bookings INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_active_bookings
  FROM public.bookings
  WHERE status NOT IN ('completed', 'paid_completed', 'cancelled', 'disputed');

  SELECT COUNT(*) INTO v_online_workers
  FROM public.workers
  WHERE availability->>'status' = 'available';

  SELECT COUNT(*) INTO v_open_disputes
  FROM public.disputes
  WHERE status IN ('open', 'under_review');

  SELECT COUNT(*) INTO v_failed_payments
  FROM public.payment_transactions
  WHERE payment_status = 'failed'
  AND created_at >= NOW() - INTERVAL '24 hours';

  SELECT
    COALESCE(SUM(total_price), 0),
    COUNT(*)
  INTO v_today_revenue, v_today_bookings
  FROM public.bookings
  WHERE status IN ('completed', 'paid_completed')
  AND created_at >= CURRENT_DATE;

  RETURN jsonb_build_object(
    'active_bookings', v_active_bookings,
    'online_workers', v_online_workers,
    'open_disputes', v_open_disputes,
    'failed_payments_24h', v_failed_payments,
    'today_revenue', v_today_revenue,
    'today_bookings', v_today_bookings
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 10. Helper function: Log admin action (called from API routes)
CREATE OR REPLACE FUNCTION public.log_admin_action(
  p_admin_id UUID,
  p_action_type TEXT,
  p_target_type TEXT,
  p_target_id TEXT,
  p_target_name TEXT,
  p_old_value JSONB,
  p_new_value JSONB,
  p_reason TEXT,
  p_ip_address TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_log_id UUID;
BEGIN
  INSERT INTO public.admin_logs (
    admin_id, action_type, target_type, target_id, target_name,
    old_value, new_value, reason, ip_address
  ) VALUES (
    p_admin_id, p_action_type, p_target_type, p_target_id, p_target_name,
    p_old_value, p_new_value, p_reason, p_ip_address
  ) RETURNING id INTO v_log_id;

  RETURN v_log_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
