-- Rollback Migration: 20260603_sync_rollback.sql
-- Description: Disables and drops synchronization triggers between partners/workers and customers/clients.
-- Safeguard: Does NOT drop tables or columns to prevent any accidental data loss.

-- 1. Drop triggers
DROP TRIGGER IF EXISTS tr_sync_partners_to_workers ON public.partners;
DROP TRIGGER IF EXISTS sync_partners_to_workers ON public.partners;
DROP TRIGGER IF EXISTS trigger_sync_partners_to_workers ON public.partners;

DROP TRIGGER IF EXISTS tr_sync_workers_to_partners ON public.workers;
DROP TRIGGER IF EXISTS sync_workers_to_partners ON public.workers;
DROP TRIGGER IF EXISTS trigger_sync_workers_to_partners ON public.workers;

DROP TRIGGER IF EXISTS tr_sync_customers_to_clients ON public.customers;
DROP TRIGGER IF EXISTS sync_customers_to_clients ON public.customers;
DROP TRIGGER IF EXISTS trigger_sync_customers_to_clients ON public.customers;

-- 2. Drop trigger functions
DROP FUNCTION IF EXISTS public.sync_partners_to_workers();
DROP FUNCTION IF EXISTS public.sync_workers_to_partners();
DROP FUNCTION IF EXISTS public.sync_customers_to_clients();

-- Note: We intentionally DO NOT execute ALTER TABLE DROP COLUMN statements 
-- to ensure no user data is lost if you roll back the triggers.
