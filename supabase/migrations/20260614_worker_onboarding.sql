-- Migration: 20260614_worker_onboarding.sql
-- Description: Implement worker onboarding additions, custom document storage, and partial-progress trigger updates.

-- 1. Upgrade public.partners schema
ALTER TABLE public.partners ADD COLUMN IF NOT EXISTS city_id UUID REFERENCES public.cities(id) ON DELETE SET NULL;
ALTER TABLE public.partners ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE public.partners ADD COLUMN IF NOT EXISTS bio TEXT;
ALTER TABLE public.partners ADD COLUMN IF NOT EXISTS id_proof_type TEXT;
ALTER TABLE public.partners ADD COLUMN IF NOT EXISTS id_proof_url TEXT;
ALTER TABLE public.partners ADD COLUMN IF NOT EXISTS current_step INTEGER DEFAULT 1;

-- 2. Upgrade trigger function sync_partners_to_workers to handle partial saves gracefully
CREATE OR REPLACE FUNCTION public.sync_partners_to_workers()
RETURNS TRIGGER AS $$
DECLARE
  v_experience_years INTEGER;
  v_city_id UUID;
  v_area_id UUID;
  v_worker_status TEXT;
BEGIN
  -- Partial Save Guard: category/service_category is NOT NULL in public.workers table.
  -- If onboarding is in progress and category is not selected yet, skip worker upsert.
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
    COALESCE(NEW.bio, 'Zolvo Professional Profile.'),
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
    bio = EXCLUDED.bio,
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

  -- 1d. Initialize location (syncing city_id from partners)
  SELECT id INTO v_city_id FROM public.cities WHERE slug = 'bhilwara' LIMIT 1;
  IF NEW.working_areas IS NOT NULL AND array_length(NEW.working_areas, 1) > 0 THEN
    SELECT id INTO v_area_id FROM public.areas WHERE name = NEW.working_areas[1] LIMIT 1;
  END IF;
  
  IF v_area_id IS NULL THEN
    SELECT id INTO v_area_id FROM public.areas LIMIT 1;
  END IF;

  -- Use specific partner's city_id if provided
  v_city_id := COALESCE(NEW.city_id, v_city_id);

  INSERT INTO public.worker_locations (worker_id, city_id, area_id)
  VALUES (NEW.profile_id, v_city_id, v_area_id)
  ON CONFLICT (worker_id) 
  DO UPDATE SET city_id = EXCLUDED.city_id, area_id = EXCLUDED.area_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 3. Register the Storage Bucket for KYC documents
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'worker-documents', 
  'worker-documents', 
  true, 
  5242880, -- 5MB limit
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
ON CONFLICT (id) DO NOTHING;

-- 4. Enable RLS Policies on Storage Objects
DROP POLICY IF EXISTS "Allow public read access to worker documents" ON storage.objects;
CREATE POLICY "Allow public read access to worker documents" ON storage.objects
  FOR SELECT USING (bucket_id = 'worker-documents');

DROP POLICY IF EXISTS "Allow authenticated upload to own folder" ON storage.objects;
CREATE POLICY "Allow authenticated upload to own folder" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'worker-documents' 
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
