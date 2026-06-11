-- ============================================================
-- Migration: 20260621_notification_infrastructure.sql
-- Description: Core schema additions for Zolvo Notification System
-- ============================================================

-- 1. Alter notifications table to add compatibility fields
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS role TEXT CHECK (role IN ('client', 'worker', 'admin', 'system')) DEFAULT 'system',
  ADD COLUMN IF NOT EXISTS message TEXT,
  ADD COLUMN IF NOT EXISTS read_status TEXT CHECK (read_status IN ('unread', 'read')) DEFAULT 'unread';

-- 2. Trigger function to keep message<=>content and read_status<=>is_read in sync
CREATE OR REPLACE FUNCTION public.sync_notification_compat()
RETURNS TRIGGER AS $$
BEGIN
  -- Handle content <=> message sync
  IF NEW.content IS NOT NULL AND NEW.message IS NULL THEN
    NEW.message := NEW.content;
  ELSIF NEW.message IS NOT NULL AND NEW.content IS NULL THEN
    NEW.content := NEW.message;
  ELSIF NEW.message IS DISTINCT FROM OLD.message THEN
    NEW.content := NEW.message;
  ELSIF NEW.content IS DISTINCT FROM OLD.content THEN
    NEW.message := NEW.content;
  END IF;

  -- Handle is_read <=> read_status sync
  IF NEW.is_read IS NOT NULL AND NEW.read_status IS NULL THEN
    NEW.read_status := CASE WHEN NEW.is_read THEN 'read' ELSE 'unread' END;
  ELSIF NEW.read_status IS NOT NULL AND NEW.is_read IS NULL THEN
    NEW.is_read := (NEW.read_status = 'read');
  ELSIF NEW.read_status IS DISTINCT FROM OLD.read_status THEN
    NEW.is_read := (NEW.read_status = 'read');
  ELSIF NEW.is_read IS DISTINCT FROM OLD.is_read THEN
    NEW.read_status := CASE WHEN NEW.is_read THEN 'read' ELSE 'unread' END;
  END IF;

  -- Auto populate role based on recipient profile if role is system/default
  IF NEW.role = 'system' OR NEW.role IS NULL THEN
    DECLARE
      v_role TEXT;
    BEGIN
      SELECT role::text INTO v_role FROM public.profiles WHERE id = NEW.user_id;
      IF v_role IS NOT NULL THEN
        NEW.role := v_role;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_sync_notification_compat ON public.notifications;
CREATE TRIGGER tr_sync_notification_compat
  BEFORE INSERT OR UPDATE ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION public.sync_notification_compat();

-- 3. Create user_device_tokens table
CREATE TABLE IF NOT EXISTS public.user_device_tokens (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  token TEXT NOT NULL,
  platform TEXT CHECK (platform IN ('web', 'android', 'ios', 'other')) DEFAULT 'web',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, token)
);

CREATE INDEX IF NOT EXISTS idx_device_tokens_user ON public.user_device_tokens(user_id);

-- 4. Create notification_delivery_logs table for tracking dispatches
CREATE TABLE IF NOT EXISTS public.notification_delivery_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  notification_id UUID REFERENCES public.notifications(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK (channel IN ('push', 'sms', 'in_app', 'email')),
  provider TEXT, -- 'twilio', 'msg91', 'fast2sms', 'aws_sns', 'fcm', etc.
  status TEXT NOT NULL CHECK (status IN ('queued', 'sent', 'delivered', 'failed')),
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3,
  error_message TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_delivery_logs_notification ON public.notification_delivery_logs(notification_id);
CREATE INDEX IF NOT EXISTS idx_delivery_logs_status ON public.notification_delivery_logs(status);

-- 5. Create reporting_notification_analytics view
CREATE OR REPLACE VIEW public.reporting_notification_analytics AS
SELECT
  channel,
  COUNT(CASE WHEN status IN ('sent', 'delivered') THEN 1 END) AS sent_count,
  COUNT(CASE WHEN status = 'delivered' THEN 1 END) AS delivered_count,
  COUNT(CASE WHEN status = 'failed' THEN 1 END) AS failure_count,
  (SELECT COUNT(*) FROM public.notifications n WHERE n.is_read = TRUE) AS read_count
FROM public.notification_delivery_logs
GROUP BY channel;

-- 6. Enable Row Level Security (RLS) on new tables
ALTER TABLE public.user_device_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_delivery_logs ENABLE ROW LEVEL SECURITY;

-- 7. RLS Policies
-- A. user_device_tokens
DROP POLICY IF EXISTS "Users can manage own device tokens" ON public.user_device_tokens;
CREATE POLICY "Users can manage own device tokens" ON public.user_device_tokens
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins can view all device tokens" ON public.user_device_tokens;
CREATE POLICY "Admins can view all device tokens" ON public.user_device_tokens
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- B. notification_delivery_logs
DROP POLICY IF EXISTS "Admins can view delivery logs" ON public.notification_delivery_logs;
CREATE POLICY "Admins can view delivery logs" ON public.notification_delivery_logs
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

DROP POLICY IF EXISTS "Service role can modify delivery logs" ON public.notification_delivery_logs;
CREATE POLICY "Service role can modify delivery logs" ON public.notification_delivery_logs
  FOR ALL USING (true) WITH CHECK (true);
