-- Decouple tables from Supabase auth.users to support Firebase auth-driven profiles
-- Fix foreign key constraint violations in booking_timeline, payout_logs, and auth_audit_events

-- 1. Decouple booking_timeline.created_by
ALTER TABLE public.booking_timeline
  DROP CONSTRAINT IF EXISTS booking_timeline_created_by_fkey,
  ADD CONSTRAINT booking_timeline_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;

-- 2. Decouple payout_logs.worker_id
ALTER TABLE public.payout_logs
  DROP CONSTRAINT IF EXISTS payout_logs_worker_id_fkey,
  ADD CONSTRAINT payout_logs_worker_id_fkey
    FOREIGN KEY (worker_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

-- 3. Decouple auth_audit_events.user_id
ALTER TABLE public.auth_audit_events
  DROP CONSTRAINT IF EXISTS auth_audit_events_user_id_fkey,
  ADD CONSTRAINT auth_audit_events_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE SET NULL;
