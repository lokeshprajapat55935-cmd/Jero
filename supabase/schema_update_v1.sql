/**
 * Supabase Database Schema - Phase 3 Updates
 */

-- Add username to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS username TEXT UNIQUE;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS location_name TEXT;

-- Update workers table
ALTER TABLE public.workers ADD COLUMN IF NOT EXISTS languages TEXT[] DEFAULT '{}';
ALTER TABLE public.workers ADD COLUMN IF NOT EXISTS social_links JSONB DEFAULT '{}';
ALTER TABLE public.workers ADD COLUMN IF NOT EXISTS service_area TEXT;
ALTER TABLE public.workers ADD COLUMN IF NOT EXISTS rating_avg NUMERIC DEFAULT 0;
ALTER TABLE public.workers ADD COLUMN IF NOT EXISTS review_count INTEGER DEFAULT 0;
ALTER TABLE public.workers ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';

-- Create Services table for multi-service support
CREATE TABLE IF NOT EXISTS public.services (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  worker_id UUID REFERENCES public.workers(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  price NUMERIC NOT NULL,
  category TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS for services
ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Services are viewable by everyone." ON public.services
  FOR SELECT USING (true);

CREATE POLICY "Workers can manage their own services." ON public.services
  FOR ALL USING (auth.uid() = worker_id);

-- Create index for faster worker service lookup
CREATE INDEX IF NOT EXISTS idx_services_worker_id ON public.services(worker_id);
CREATE INDEX IF NOT EXISTS idx_services_category ON public.services(category);

-- Update handles_new_user to handle username if provided in metadata
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, avatar_url, username)
  VALUES (
    NEW.id, 
    NEW.email, 
    NEW.raw_user_meta_data->>'full_name', 
    NEW.raw_user_meta_data->>'avatar_url',
    COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1) || floor(random()*1000)::text)
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
