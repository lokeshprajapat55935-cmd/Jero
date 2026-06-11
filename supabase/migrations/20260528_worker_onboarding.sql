-- Onboarding & Verification System Migration
-- Run this in your Supabase SQL Editor to prepare/update the database.

-- 1. Alter public.workers to support onboarding steps, basic details, and new verification statuses
ALTER TABLE public.workers 
  ADD COLUMN IF NOT EXISTS dob DATE,
  ADD COLUMN IF NOT EXISTS gender TEXT,
  ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS onboarding_step INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMPTZ DEFAULT NOW();

-- Change default status to 'pending'
ALTER TABLE public.workers ALTER COLUMN status SET DEFAULT 'pending';

-- 2. Create worker_documents table for uploading Aadhaar, Selfie, and Police Verification
CREATE TABLE IF NOT EXISTS public.worker_documents (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  worker_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  document_type TEXT NOT NULL, -- 'aadhaar', 'selfie', 'police_verification'
  document_url TEXT NOT NULL,
  verified BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Create worker_wallets table for transaction security
CREATE TABLE IF NOT EXISTS public.worker_wallets (
  worker_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  balance NUMERIC NOT NULL DEFAULT 0.00,
  currency TEXT DEFAULT 'INR',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Create worker_locations table for live coordinate mapping
CREATE TABLE IF NOT EXISTS public.worker_locations (
  worker_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  latitude NUMERIC,
  longitude NUMERIC,
  city_id UUID REFERENCES public.cities(id),
  area_id UUID REFERENCES public.areas(id),
  last_active_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Create worker_status_logs table for audit tracking
CREATE TABLE IF NOT EXISTS public.worker_status_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  worker_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  old_status TEXT,
  new_status TEXT NOT NULL,
  reason TEXT,
  changed_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. Create worker_service_categories table for multi-category skills mapping
CREATE TABLE IF NOT EXISTS public.worker_service_categories (
  worker_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  category TEXT NOT NULL, -- 'electrician', 'plumber', 'ac_technician', 'carpenter'
  PRIMARY KEY (worker_id, category)
);

-- 7. Row Level Security Policies Configuration

-- Enable RLS on new tables
ALTER TABLE public.worker_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.worker_wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.worker_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.worker_status_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.worker_service_categories ENABLE ROW LEVEL SECURITY;

-- Worker Documents Policies
CREATE POLICY "Users can view own documents" ON public.worker_documents
  FOR SELECT USING (auth.uid() = worker_id OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "Workers can upload own documents" ON public.worker_documents
  FOR INSERT WITH CHECK (auth.uid() = worker_id);

CREATE POLICY "Only admins can modify documents verification" ON public.worker_documents
  FOR UPDATE USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

-- Worker Wallets Policies
CREATE POLICY "Users can view own wallet" ON public.worker_wallets
  FOR SELECT USING (auth.uid() = worker_id OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "Only admins can insert or update wallets directly" ON public.worker_wallets
  FOR ALL USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

-- Worker Locations Policies
CREATE POLICY "Locations viewable by everyone" ON public.worker_locations
  FOR SELECT USING (true);

CREATE POLICY "Workers can update own location" ON public.worker_locations
  FOR ALL USING (auth.uid() = worker_id);

-- Worker Status Logs Policies
CREATE POLICY "Status logs viewable by self and admin" ON public.worker_status_logs
  FOR SELECT USING (auth.uid() = worker_id OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "Only admins can create status logs" ON public.worker_status_logs
  FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

-- Worker Service Categories Policies
CREATE POLICY "Service categories viewable by everyone" ON public.worker_service_categories
  FOR SELECT USING (true);

CREATE POLICY "Workers can manage own service categories" ON public.worker_service_categories
  FOR ALL USING (auth.uid() = worker_id);

-- 8. Restrict Worker Profile SELECT: hide unapproved workers and limit public listings
DROP POLICY IF EXISTS "Workers are viewable by everyone." ON public.workers;

CREATE POLICY "Workers viewable by self, admins, or clients with active bookings" ON public.workers
  FOR SELECT USING (
    auth.uid() = id OR
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin') OR
    (
      status = 'approved' AND
      EXISTS (
        SELECT 1 FROM public.bookings b
        WHERE b.worker_id = public.workers.id
        AND b.client_id = auth.uid()
      )
    )
  );

-- 9. Verification Security Trigger: Workers cannot self-approve
CREATE OR REPLACE FUNCTION public.check_worker_status_transition()
RETURNS TRIGGER AS $$
BEGIN
  -- Check if user is not admin
  IF auth.role() = 'authenticated' AND NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
  ) THEN
    -- Workers can only transition status to 'under_review' or 'pending'
    IF NEW.status NOT IN ('pending', 'under_review') THEN
      RAISE EXCEPTION 'Workers cannot approve, reject, or suspend profiles themselves.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER trigger_check_worker_status_transition
  BEFORE UPDATE OF status ON public.workers
  FOR EACH ROW EXECUTE FUNCTION public.check_worker_status_transition();

-- 10. Update last_active_at trigger when availability is updated
CREATE OR REPLACE FUNCTION public.update_worker_last_active()
RETURNS TRIGGER AS $$
BEGIN
  NEW.last_active_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trigger_update_worker_last_active
  BEFORE UPDATE OF availability ON public.workers
  FOR EACH ROW EXECUTE FUNCTION public.update_worker_last_active();
