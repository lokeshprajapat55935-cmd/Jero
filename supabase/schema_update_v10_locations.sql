/**
 * Supabase Database Schema - Location & Geo System (v10)
 * Scalable location hierarchy supporting single-city and multi-city platforms
 * 
 * Structure:
 * - countries (master reference)
 * - states (state level)
 * - cities (active service area)
 * - areas (localities/neighborhoods within city)
 * - city_config (active city for platform)
 */

-- Create countries table
CREATE TABLE IF NOT EXISTS public.countries (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  dial_code TEXT,
  currency_code TEXT DEFAULT 'INR',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO public.countries (code, name, dial_code, currency_code)
VALUES ('IN', 'India', '+91', 'INR')
ON CONFLICT (code) DO NOTHING;

-- Create states table
CREATE TABLE IF NOT EXISTS public.states (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  country_id UUID NOT NULL REFERENCES public.countries(id),
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(country_id, code)
);

INSERT INTO public.states (country_id, code, name)
SELECT id, 'RJ', 'Rajasthan' FROM public.countries WHERE code = 'IN'
ON CONFLICT (country_id, code) DO NOTHING;

-- Create cities table (service areas for platform)
CREATE TABLE IF NOT EXISTS public.cities (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  state_id UUID NOT NULL REFERENCES public.states(id),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT FALSE,
  latitude NUMERIC,
  longitude NUMERIC,
  service_radius_km NUMERIC DEFAULT 25,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create areas/localities table (neighborhoods within cities)
CREATE TABLE IF NOT EXISTS public.areas (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  city_id UUID NOT NULL REFERENCES public.cities(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  display_name TEXT,
  slug TEXT NOT NULL,
  pincode TEXT,
  latitude NUMERIC,
  longitude NUMERIC,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(city_id, slug)
);

-- Create index for area lookups
CREATE INDEX IF NOT EXISTS idx_areas_city_id ON public.areas(city_id);
CREATE INDEX IF NOT EXISTS idx_areas_slug ON public.areas(slug);

-- Create platform configuration table
CREATE TABLE IF NOT EXISTS public.platform_config (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  key TEXT UNIQUE NOT NULL,
  value TEXT,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Set initial active city (Bhilwara for now)
INSERT INTO public.platform_config (key, value, description)
VALUES 
  ('active_city_slug', 'bhilwara', 'Currently active city for the platform'),
  ('active_city_mode', 'single', 'Platform mode: single or multi-city')
ON CONFLICT (key) DO NOTHING;

-- Bhilwara, Rajasthan setup
DO $$
DECLARE
  rajasthan_id UUID;
  bhilwara_city_id UUID;
BEGIN
  -- Get Rajasthan state ID
  SELECT id INTO rajasthan_id FROM public.states WHERE code = 'RJ' LIMIT 1;
  
  -- Insert Bhilwara city
  INSERT INTO public.cities (state_id, name, slug, description, is_active, latitude, longitude)
  VALUES (rajasthan_id, 'Bhilwara', 'bhilwara', 'Professional local services in Bhilwara, Rajasthan', TRUE, 25.3596, 74.6319)
  ON CONFLICT (slug) DO NOTHING
  RETURNING id INTO bhilwara_city_id;
  
  -- Get Bhilwara city ID if not just inserted
  IF bhilwara_city_id IS NULL THEN
    SELECT id INTO bhilwara_city_id FROM public.cities WHERE slug = 'bhilwara' LIMIT 1;
  END IF;
  
  -- Insert Bhilwara areas/localities
  INSERT INTO public.areas (city_id, name, display_name, slug, pincode)
  VALUES 
    (bhilwara_city_id, 'Subhash Nagar', 'Subhash Nagar, Bhilwara', 'subhash-nagar', '311001'),
    (bhilwara_city_id, 'Shastri Nagar', 'Shastri Nagar, Bhilwara', 'shastri-nagar', '311001'),
    (bhilwara_city_id, 'Azad Nagar', 'Azad Nagar, Bhilwara', 'azad-nagar', '311001'),
    (bhilwara_city_id, 'Railway Station Area', 'Railway Station Area, Bhilwara', 'railway-station', '311001'),
    (bhilwara_city_id, 'Mahatma Gandhi Hospital Area', 'Mahatma Gandhi Hospital Area, Bhilwara', 'mg-hospital', '311001'),
    (bhilwara_city_id, 'Old City', 'Old City, Bhilwara', 'old-city', '311001'),
    (bhilwara_city_id, 'New City', 'New City, Bhilwara', 'new-city', '311001'),
    (bhilwara_city_id, 'Collectorate Area', 'Collectorate Area, Bhilwara', 'collectorate', '311001'),
    (bhilwara_city_id, 'Kotwali Area', 'Kotwali Area, Bhilwara', 'kotwali', '311001'),
    (bhilwara_city_id, 'Mill Area', 'Mill Area, Bhilwara', 'mill-area', '311001')
  ON CONFLICT (city_id, slug) DO NOTHING;
END $$;

-- Enable RLS
ALTER TABLE public.countries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.states ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.areas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_config ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Countries are viewable by everyone" ON public.countries FOR SELECT USING (true);
CREATE POLICY "States are viewable by everyone" ON public.states FOR SELECT USING (true);
CREATE POLICY "Cities are viewable by everyone" ON public.cities FOR SELECT USING (true);
CREATE POLICY "Areas are viewable by everyone" ON public.areas FOR SELECT USING (true);
CREATE POLICY "Platform config viewable by everyone" ON public.platform_config FOR SELECT USING (true);
CREATE POLICY "Only admins can update platform config" ON public.platform_config FOR UPDATE USING (
  auth.jwt() ->> 'role' = 'admin' OR
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
);

-- Update workers table to add area reference
ALTER TABLE public.workers ADD COLUMN IF NOT EXISTS area_id UUID REFERENCES public.areas(id);
ALTER TABLE public.workers ADD COLUMN IF NOT EXISTS city_id UUID REFERENCES public.cities(id);

-- Create index for worker city/area filtering
CREATE INDEX IF NOT EXISTS idx_workers_city_id ON public.workers(city_id);
CREATE INDEX IF NOT EXISTS idx_workers_area_id ON public.workers(area_id);

-- Update clients table to add city reference
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS city_id UUID REFERENCES public.cities(id);
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS area_id UUID REFERENCES public.areas(id);

-- Create index for client queries
CREATE INDEX IF NOT EXISTS idx_clients_city_id ON public.clients(city_id);

-- Update bookings table to add city reference (for audit/analytics)
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS city_id UUID REFERENCES public.cities(id);

-- Helper function: Get active city
CREATE OR REPLACE FUNCTION public.get_active_city()
RETURNS TABLE (id UUID, name TEXT, slug TEXT, state_id UUID) AS $$
BEGIN
  RETURN QUERY
  SELECT c.id, c.name, c.slug, c.state_id
  FROM public.cities c
  WHERE c.slug = (
    SELECT value FROM public.platform_config WHERE key = 'active_city_slug' LIMIT 1
  )
  LIMIT 1;
END;
$$ LANGUAGE plpgsql;

-- Helper function: Get city by slug
CREATE OR REPLACE FUNCTION public.get_city_by_slug(city_slug TEXT)
RETURNS TABLE (id UUID, name TEXT, slug TEXT, is_active BOOLEAN, state_id UUID) AS $$
BEGIN
  RETURN QUERY
  SELECT c.id, c.name, c.slug, c.is_active, c.state_id
  FROM public.cities c
  WHERE c.slug = city_slug
  LIMIT 1;
END;
$$ LANGUAGE plpgsql;

-- Helper function: Get areas for a city
CREATE OR REPLACE FUNCTION public.get_city_areas(city_slug TEXT)
RETURNS TABLE (id UUID, name TEXT, display_name TEXT, slug TEXT, pincode TEXT) AS $$
BEGIN
  RETURN QUERY
  SELECT a.id, a.name, a.display_name, a.slug, a.pincode
  FROM public.areas a
  INNER JOIN public.cities c ON a.city_id = c.id
  WHERE c.slug = city_slug
  ORDER BY a.name ASC;
END;
$$ LANGUAGE plpgsql;

-- Geographical restrictions (e.g. Bhilwara) are enforced at the application layer to allow for multi-city scaling.

