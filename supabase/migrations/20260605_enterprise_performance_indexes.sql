-- ============================================================
-- Zolvo Enterprise Stability & Performance Indexing Migration
-- ============================================================

-- 1. Optimize bookings queries by status and date (used for admin/client/worker dispatch lists)
CREATE INDEX IF NOT EXISTS idx_bookings_status_created ON public.bookings(status, created_at DESC);

-- 2. Optimize dispatch attempts sorting/lookup by status and worker (used for real-time dispatch loop)
CREATE INDEX IF NOT EXISTS idx_dispatch_attempts_status_worker ON public.dispatch_attempts(status, worker_id);

-- 3. Optimize payment transaction queries by status and date (used for admin payment ledger & status checks)
CREATE INDEX IF NOT EXISTS idx_payment_transactions_status ON public.payment_transactions(payment_status, created_at DESC);
