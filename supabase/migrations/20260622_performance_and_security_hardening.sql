-- ============================================================
-- Zolvo Performance & Security Hardening Migration
-- Adds foreign key indexes for scalability and triggers for admin alerts
-- ============================================================

-- 1. Index Enhancements for High Load Scalability (100+ users, 1000+ bookings/day)
CREATE INDEX IF NOT EXISTS idx_bookings_client_id ON public.bookings(client_id);
CREATE INDEX IF NOT EXISTS idx_bookings_worker_id ON public.bookings(worker_id);
CREATE INDEX IF NOT EXISTS idx_bookings_city_id ON public.bookings(city_id);

CREATE INDEX IF NOT EXISTS idx_reviews_booking_id ON public.reviews(booking_id);
CREATE INDEX IF NOT EXISTS idx_reviews_worker_id ON public.reviews(worker_id);

CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON public.notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON public.notifications(is_read) WHERE is_read = false;

CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON public.messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_saved_workers_client_id ON public.saved_workers(client_id);
CREATE INDEX IF NOT EXISTS idx_saved_workers_worker_id ON public.saved_workers(worker_id);

-- 2. Real-Time Admin Alerting Trigger Function
CREATE OR REPLACE FUNCTION public.alert_admins_of_critical_log()
RETURNS TRIGGER AS $$
DECLARE
  v_admin RECORD;
BEGIN
  IF NEW.severity IN ('high', 'critical') THEN
    -- Loop through all admin profiles and send system alerts
    FOR v_admin IN (SELECT id FROM public.profiles WHERE role = 'admin') LOOP
      INSERT INTO public.notifications (user_id, type, title, content, link_url, metadata)
      VALUES (
        v_admin.id,
        'system',
        '[CRITICAL SYSTEM ALARM] ' || NEW.event_type,
        NEW.description,
        '/admin/dashboard',
        jsonb_build_object('log_id', NEW.id, 'severity', NEW.severity)
      );
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Safe trigger drop and create
DROP TRIGGER IF EXISTS trigger_alert_admins_of_critical_log ON public.security_logs;
CREATE TRIGGER trigger_alert_admins_of_critical_log
  AFTER INSERT ON public.security_logs
  FOR EACH ROW EXECUTE FUNCTION public.alert_admins_of_critical_log();
