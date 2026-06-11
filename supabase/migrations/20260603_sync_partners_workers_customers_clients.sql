-- Migration: 20260603_sync_partners_workers_customers_clients.sql
-- Description: Automatically sync partners <-> workers and customers -> clients in real-time.

-- Ensure columns added in worker_onboarding migration exist in public.workers
ALTER TABLE public.workers ADD COLUMN IF NOT EXISTS dob DATE;
ALTER TABLE public.workers ADD COLUMN IF NOT EXISTS gender TEXT;
ALTER TABLE public.workers ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN DEFAULT FALSE;
ALTER TABLE public.workers ADD COLUMN IF NOT EXISTS onboarding_step INTEGER DEFAULT 1;
ALTER TABLE public.workers ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMPTZ DEFAULT NOW();

-- 1. Create trigger function for public.partners to public.workers
CREATE OR REPLACE FUNCTION public.sync_partners_to_workers()
RETURNS TRIGGER AS $$
DECLARE
  v_experience_years INTEGER;
  v_city_id UUID;
  v_area_id UUID;
  v_worker_status TEXT;
BEGIN
  -- If service category is null, partner onboarding is incomplete; skip sync
  IF NEW.service_category IS NULL THEN
    RETURN NEW;
  END IF;

  -- Parse experience years from string (e.g., '5 Years' -> 5)
  IF NEW.experience IS NOT NULL THEN
    BEGIN
      v_experience_years := COALESCE(substring(NEW.experience from '^\d+')::integer, 0);
    EXCEPTION WHEN OTHERS THEN
      v_experience_years := 0;
    END;
  ELSE
    v_experience_years := 0;
  END IF;

  -- Map partner_status enum to workers.status text
  CASE 
    WHEN NEW.status = 'approved' THEN v_worker_status := 'approved';
    WHEN NEW.status = 'suspended' THEN v_worker_status := 'suspended';
    WHEN NEW.status = 'rejected' THEN v_worker_status := 'rejected';
    WHEN NEW.status = 'under_review' THEN v_worker_status := 'under_review';
    ELSE v_worker_status := 'pending';
  END CASE;

  -- 1a. Upsert public.workers
  INSERT INTO public.workers (
    id,
    category,
    bio,
    experience_years,
    skills,
    dob,
    gender,
    status,
    onboarding_completed,
    onboarding_step
  ) VALUES (
    NEW.profile_id,
    NEW.service_category,
    'Zolvo Professional Profile.',
    v_experience_years,
    NEW.skills,
    NEW.dob,
    NEW.gender,
    v_worker_status,
    TRUE,
    6
  )
  ON CONFLICT (id) DO UPDATE SET
    category = EXCLUDED.category,
    experience_years = EXCLUDED.experience_years,
    skills = EXCLUDED.skills,
    dob = EXCLUDED.dob,
    gender = EXCLUDED.gender,
    status = EXCLUDED.status,
    onboarding_completed = TRUE,
    onboarding_step = 6;

  -- 1b. Initialize wallet if missing
  INSERT INTO public.worker_wallets (worker_id, balance)
  VALUES (NEW.profile_id, 500.00)
  ON CONFLICT (worker_id) DO NOTHING;

  -- 1c. Sync service categories
  DELETE FROM public.worker_service_categories WHERE worker_id = NEW.profile_id;
  IF NEW.service_category IS NOT NULL THEN
    INSERT INTO public.worker_service_categories (worker_id, category)
    VALUES (NEW.profile_id, NEW.service_category)
    ON CONFLICT (worker_id, category) DO NOTHING;
  END IF;

  -- 1d. Initialize location if missing
  SELECT id INTO v_city_id FROM public.cities WHERE slug = 'bhilwara' LIMIT 1;
  IF NEW.working_areas IS NOT NULL AND array_length(NEW.working_areas, 1) > 0 THEN
    SELECT id INTO v_area_id FROM public.areas WHERE name = NEW.working_areas[1] LIMIT 1;
  END IF;
  
  IF v_area_id IS NULL THEN
    SELECT id INTO v_area_id FROM public.areas LIMIT 1;
  END IF;

  INSERT INTO public.worker_locations (worker_id, city_id, area_id)
  VALUES (NEW.profile_id, v_city_id, v_area_id)
  ON CONFLICT (worker_id) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger on public.partners with recursion safeguard
DROP TRIGGER IF EXISTS tr_sync_partners_to_workers ON public.partners;
DROP TRIGGER IF EXISTS sync_partners_to_workers ON public.partners;
DROP TRIGGER IF EXISTS trigger_sync_partners_to_workers ON public.partners;
CREATE TRIGGER tr_sync_partners_to_workers
  AFTER INSERT OR UPDATE ON public.partners
  FOR EACH ROW 
  WHEN (pg_trigger_depth() < 2)
  EXECUTE FUNCTION public.sync_partners_to_workers();


-- 2. Create trigger function for public.workers to public.partners (bidirectional sync)
CREATE OR REPLACE FUNCTION public.sync_workers_to_partners()
RETURNS TRIGGER AS $$
DECLARE
  v_full_name TEXT;
  v_partner_status partner_status;
BEGIN
  -- Map workers.status (TEXT) to partner_status ENUM
  CASE 
    WHEN NEW.status IN ('active', 'approved') THEN v_partner_status := 'approved'::partner_status;
    WHEN NEW.status = 'suspended' THEN v_partner_status := 'suspended'::partner_status;
    WHEN NEW.status = 'rejected' THEN v_partner_status := 'rejected'::partner_status;
    WHEN NEW.status = 'under_review' THEN v_partner_status := 'under_review'::partner_status;
    ELSE v_partner_status := 'pending'::partner_status;
  END CASE;

  IF TG_OP = 'INSERT' THEN
    SELECT full_name INTO v_full_name FROM public.profiles WHERE id = NEW.id;
    
    INSERT INTO public.partners (
      profile_id,
      full_name,
      gender,
      dob,
      service_category,
      experience,
      skills,
      status
    ) VALUES (
      NEW.id,
      COALESCE(v_full_name, 'Partner'),
      NEW.gender,
      NEW.dob,
      NEW.category,
      COALESCE(NEW.experience_years, 0)::text || ' Years',
      NEW.skills,
      v_partner_status
    )
    ON CONFLICT (profile_id) DO NOTHING;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      UPDATE public.partners
      SET status = v_partner_status, updated_at = NOW()
      WHERE profile_id = NEW.id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger on public.workers with recursion safeguard
DROP TRIGGER IF EXISTS tr_sync_workers_to_partners ON public.workers;
DROP TRIGGER IF EXISTS sync_workers_to_partners ON public.workers;
DROP TRIGGER IF EXISTS trigger_sync_workers_to_partners ON public.workers;
CREATE TRIGGER tr_sync_workers_to_partners
  AFTER INSERT OR UPDATE ON public.workers
  FOR EACH ROW 
  WHEN (pg_trigger_depth() < 2)
  EXECUTE FUNCTION public.sync_workers_to_partners();


-- 3. Create trigger function for public.customers to public.clients
CREATE OR REPLACE FUNCTION public.sync_customers_to_clients()
RETURNS TRIGGER AS $$
DECLARE
  v_phone TEXT;
  v_city_id UUID;
  v_area_id UUID;
BEGIN
  SELECT phone INTO v_phone FROM public.profiles WHERE id = NEW.profile_id;
  SELECT id INTO v_city_id FROM public.cities WHERE slug = 'bhilwara' LIMIT 1;
  SELECT id INTO v_area_id FROM public.areas LIMIT 1;

  INSERT INTO public.clients (id, address, phone, city_id, area_id)
  VALUES (NEW.profile_id, NEW.address, v_phone, v_city_id, v_area_id)
  ON CONFLICT (id) DO UPDATE SET
    address = EXCLUDED.address,
    phone = COALESCE(EXCLUDED.phone, public.clients.phone);
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger on public.customers
DROP TRIGGER IF EXISTS tr_sync_customers_to_clients ON public.customers;
DROP TRIGGER IF EXISTS sync_customers_to_clients ON public.customers;
DROP TRIGGER IF EXISTS trigger_sync_customers_to_clients ON public.customers;
CREATE TRIGGER tr_sync_customers_to_clients
  AFTER INSERT OR UPDATE ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.sync_customers_to_clients();


-- 4. Perform one-time backfill synchronization for existing records

-- Disable triggers to prevent recursive firing and side-effects during backfill
ALTER TABLE public.workers DISABLE TRIGGER USER;
ALTER TABLE public.partners DISABLE TRIGGER USER;
ALTER TABLE public.customers DISABLE TRIGGER USER;
ALTER TABLE public.clients DISABLE TRIGGER USER;

-- Sync existing customers to clients
INSERT INTO public.clients (id, address, phone, city_id, area_id)
SELECT 
  c.profile_id, 
  c.address, 
  p.phone,
  (SELECT id FROM public.cities WHERE slug = 'bhilwara' LIMIT 1),
  (SELECT id FROM public.areas LIMIT 1)
FROM public.customers c
JOIN public.profiles p ON p.id = c.profile_id
ON CONFLICT (id) DO UPDATE SET address = EXCLUDED.address;

-- Sync existing partners to workers
INSERT INTO public.workers (
  id, 
  category, 
  experience_years, 
  skills, 
  dob, 
  gender, 
  status, 
  onboarding_completed, 
  onboarding_step
)
SELECT 
  pt.profile_id, 
  pt.service_category, 
  COALESCE(substring(pt.experience from '^\d+')::integer, 0),
  pt.skills,
  pt.dob,
  pt.gender,
  CASE 
    WHEN pt.status = 'approved' THEN 'approved'
    WHEN pt.status = 'suspended' THEN 'suspended'
    WHEN pt.status = 'rejected' THEN 'rejected'
    WHEN pt.status = 'under_review' THEN 'under_review'
    ELSE 'pending'
  END,
  TRUE,
  6
FROM public.partners pt
WHERE pt.service_category IS NOT NULL
ON CONFLICT (id) DO UPDATE SET
  category = EXCLUDED.category,
  experience_years = EXCLUDED.experience_years,
  skills = EXCLUDED.skills,
  dob = EXCLUDED.dob,
  gender = EXCLUDED.gender,
  status = EXCLUDED.status;

-- Sync existing workers to partners (for legacy/test profiles)
INSERT INTO public.partners (
  profile_id,
  full_name,
  gender,
  dob,
  service_category,
  experience,
  skills,
  status
)
SELECT
  w.id,
  COALESCE(p.full_name, 'Partner'),
  w.gender,
  w.dob,
  w.category,
  COALESCE(w.experience_years, 0)::text || ' Years',
  w.skills,
  CASE 
    WHEN w.status IN ('active', 'approved') THEN 'approved'::partner_status
    WHEN w.status = 'suspended' THEN 'suspended'::partner_status
    WHEN w.status = 'rejected' THEN 'rejected'::partner_status
    WHEN w.status = 'under_review' THEN 'under_review'::partner_status
    ELSE 'pending'::partner_status
  END
FROM public.workers w
JOIN public.profiles p ON p.id = w.id
ON CONFLICT (profile_id) DO NOTHING;

-- Sync service categories for existing workers
INSERT INTO public.worker_service_categories (worker_id, category)
SELECT pt.profile_id, pt.service_category
FROM public.partners pt
WHERE pt.service_category IS NOT NULL
ON CONFLICT (worker_id, category) DO NOTHING;

-- Initialize wallets for existing workers
INSERT INTO public.worker_wallets (worker_id, balance)
SELECT pt.profile_id, 500.00
FROM public.partners pt
WHERE pt.service_category IS NOT NULL
ON CONFLICT (worker_id) DO NOTHING;

-- Initialize locations for existing workers
INSERT INTO public.worker_locations (worker_id, city_id, area_id)
SELECT 
  pt.profile_id,
  (SELECT id FROM public.cities WHERE slug = 'bhilwara' LIMIT 1),
  COALESCE(
    (SELECT id FROM public.areas WHERE name = pt.working_areas[1] LIMIT 1),
    (SELECT id FROM public.areas LIMIT 1)
  )
FROM public.partners pt
WHERE pt.service_category IS NOT NULL
ON CONFLICT (worker_id) DO NOTHING;

-- Re-enable triggers after backfill is completed
ALTER TABLE public.workers ENABLE TRIGGER USER;
ALTER TABLE public.partners ENABLE TRIGGER USER;
ALTER TABLE public.customers ENABLE TRIGGER USER;
ALTER TABLE public.clients ENABLE TRIGGER USER;
