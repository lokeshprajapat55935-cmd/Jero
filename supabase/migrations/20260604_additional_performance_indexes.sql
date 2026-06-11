-- ============================================================
-- Zolvo Additional Performance & Query Optimization Indexes
-- ============================================================

-- 1. Optimize notifications lookup & ordering (user_id and created_at sorting)
CREATE INDEX IF NOT EXISTS idx_notifications_user_created ON public.notifications(user_id, created_at DESC);

-- 2. Optimize client active bookings checking (client_id index on active_bookings table)
CREATE INDEX IF NOT EXISTS idx_active_bookings_client ON public.active_bookings(client_id);

-- 3. Optimize worker location activity scanning (filtering offline / active workers)
CREATE INDEX IF NOT EXISTS idx_worker_locations_last_active ON public.worker_locations(last_active_at DESC);
