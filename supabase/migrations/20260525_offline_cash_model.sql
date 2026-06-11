-- Migration: Switch to Offline Cash Payment Model
-- 1. Add pricing columns to workers table
ALTER TABLE public.workers ADD COLUMN IF NOT EXISTS base_service_charge NUMERIC DEFAULT 0;
ALTER TABLE public.workers ADD COLUMN IF NOT EXISTS visit_charge NUMERIC DEFAULT 0;

-- 2. Drop monetization and payment tables (removing fintech complexity)
DROP TABLE IF EXISTS public.payment_transactions CASCADE;
DROP TABLE IF EXISTS public.webhook_events CASCADE;
DROP TABLE IF EXISTS public.worker_subscriptions CASCADE;
DROP TABLE IF EXISTS public.subscription_plans CASCADE;
DROP TABLE IF EXISTS public.lead_unlocks CASCADE;
DROP TABLE IF EXISTS public.worker_usage CASCADE;

-- 3. Update bookings table to reflect offline payment
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS payment_method TEXT DEFAULT 'cash';
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'pending'; -- pending, paid

-- 4. Clean up any remaining payment-related columns if necessary
-- (Optional: We keep total_price as it's useful for estimated range)
