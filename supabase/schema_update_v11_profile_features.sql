-- ============================================================
-- Zolvo Schema Update v11 — Partner Profile Features
-- Run this in your Supabase SQL Editor
-- ============================================================

-- 1. Add missing columns to partners table
ALTER TABLE public.partners ADD COLUMN IF NOT EXISTS bank_name TEXT;
ALTER TABLE public.partners ADD COLUMN IF NOT EXISTS partner_display_id TEXT;

-- Create unique index on partner_display_id
CREATE UNIQUE INDEX IF NOT EXISTS partners_display_id_unique_idx 
  ON public.partners(partner_display_id) 
  WHERE partner_display_id IS NOT NULL;

-- 2. Create user_preferences table
CREATE TABLE IF NOT EXISTS public.user_preferences (
  profile_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE PRIMARY KEY,
  language TEXT DEFAULT 'hi',
  notifications_enabled BOOLEAN DEFAULT TRUE,
  dark_mode BOOLEAN DEFAULT FALSE,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Enable RLS on user_preferences
ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;

-- 4. RLS Policies for user_preferences
DROP POLICY IF EXISTS "Users can view own preferences" ON public.user_preferences;
CREATE POLICY "Users can view own preferences" ON public.user_preferences
  FOR SELECT USING (auth.uid() = profile_id);

DROP POLICY IF EXISTS "Users can insert own preferences" ON public.user_preferences;
CREATE POLICY "Users can insert own preferences" ON public.user_preferences
  FOR INSERT WITH CHECK (auth.uid() = profile_id);

DROP POLICY IF EXISTS "Users can update own preferences" ON public.user_preferences;
CREATE POLICY "Users can update own preferences" ON public.user_preferences
  FOR UPDATE USING (auth.uid() = profile_id);

-- 5. Function to auto-generate partner_display_id
-- Generates ZOL-PARTNER-000001 style IDs using row number
CREATE OR REPLACE FUNCTION public.generate_partner_display_id()
RETURNS TEXT AS $$
DECLARE
  seq_num BIGINT;
BEGIN
  SELECT COUNT(*) + 1 INTO seq_num FROM public.partners WHERE partner_display_id IS NOT NULL;
  RETURN 'ZOL-PARTNER-' || LPAD(seq_num::TEXT, 6, '0');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
