-- Migration: 20260629_simplify_categories.sql
-- Description: Clean up service categories database tables, keeping only Electrician and Plumber.

-- 1. Remove all other categories from service_categories.
-- Due to ON DELETE CASCADE on catalog_services, this will automatically cascade delete 
-- all associated catalog_services and catalog_sub_services!
DELETE FROM public.service_categories
WHERE id NOT IN ('electrician', 'plumber');

-- 2. Clean up worker_service_categories mapping (using case-insensitive comparison)
DELETE FROM public.worker_service_categories
WHERE lower(category) NOT IN ('electrician', 'plumber');

-- 3. Migrate any existing worker accounts registered under other categories to default to Electrician
UPDATE public.workers
SET category = 'Electrician'
WHERE category IS NULL OR category NOT IN ('Electrician', 'Plumber');

UPDATE public.partners
SET service_category = 'Electrician'
WHERE service_category IS NULL OR service_category NOT IN ('Electrician', 'Plumber');

