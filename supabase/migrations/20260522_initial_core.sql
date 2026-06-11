-- Zolvo Initial Core Schema Migration
-- Defines core types, tables, RLS policies, and triggers

-- 1. Create Roles Enum
DO $$ 
BEGIN 
  CREATE TYPE user_role AS ENUM ('client', 'worker', 'admin'); 
EXCEPTION 
  WHEN duplicate_object THEN null; 
END $$;

-- 2. Create Location Tables
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

-- Pre-insert Bhilwara city so that it exists for active city configuration
INSERT INTO public.cities (state_id, name, slug, description, is_active, latitude, longitude)
SELECT id, 'Bhilwara', 'bhilwara', 'Primary service city', true, 25.3407, 74.6366 
FROM public.states WHERE code = 'RJ'
ON CONFLICT (slug) DO NOTHING;

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

-- Pre-populate areas for Bhilwara
DO $$
DECLARE
  bhilwara_city_id UUID;
BEGIN
  SELECT id INTO bhilwara_city_id FROM public.cities WHERE slug = 'bhilwara' LIMIT 1;
  IF bhilwara_city_id IS NOT NULL THEN
    INSERT INTO public.areas (city_id, name, display_name, slug, pincode)
    VALUES
      (bhilwara_city_id, 'Subhash Nagar', 'Subhash Nagar, Bhilwara', 'subhash-nagar', '311001'),
      (bhilwara_city_id, 'Shastri Nagar', 'Shastri Nagar, Bhilwara', 'shastri-nagar', '311001'),
      (bhilwara_city_id, 'Azad Nagar', 'Azad Nagar, Bhilwara', 'azad-nagar', '311001'),
      (bhilwara_city_id, 'Railway Station Area', 'Railway Station Area, Bhilwara', 'railway-station', '311001'),
      (bhilwara_city_id, 'Old City', 'Old City, Bhilwara', 'old-city', '311001')
    ON CONFLICT (city_id, slug) DO NOTHING;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.platform_config (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  key TEXT UNIQUE NOT NULL,
  value TEXT,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO public.platform_config (key, value, description)
VALUES 
  ('active_city_slug', 'bhilwara', 'Currently active city for the platform'),
  ('active_city_mode', 'single', 'Platform mode: single or multi-city')
ON CONFLICT (key) DO NOTHING;

-- 3. Create Profiles Table (Extends auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  email TEXT UNIQUE,
  full_name TEXT,
  avatar_url TEXT,
  phone TEXT UNIQUE,
  phone_verified BOOLEAN DEFAULT FALSE,
  role user_role DEFAULT 'client',
  onboarded BOOLEAN DEFAULT FALSE,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  username TEXT UNIQUE,
  location_name TEXT
);

-- 4. Create Workers and Clients Tables
CREATE TABLE IF NOT EXISTS public.workers (
  id UUID REFERENCES public.profiles(id) ON DELETE CASCADE PRIMARY KEY,
  category TEXT NOT NULL,
  bio TEXT,
  base_service_charge NUMERIC DEFAULT 0,
  visit_charge NUMERIC DEFAULT 0,
  experience_years INTEGER DEFAULT 0,
  skills TEXT[] DEFAULT '{}',
  verified BOOLEAN DEFAULT FALSE,
  availability JSONB DEFAULT '{}',
  gallery TEXT[] DEFAULT '{}',
  languages TEXT[] DEFAULT '{}',
  social_links JSONB DEFAULT '{}',
  service_area TEXT,
  rating_avg NUMERIC DEFAULT 0,
  review_count INTEGER DEFAULT 0,
  status TEXT DEFAULT 'active',
  city_id UUID REFERENCES public.cities(id),
  area_id UUID REFERENCES public.areas(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.clients (
  id UUID REFERENCES public.profiles(id) ON DELETE CASCADE PRIMARY KEY,
  address TEXT,
  phone TEXT,
  city_id UUID REFERENCES public.cities(id),
  area_id UUID REFERENCES public.areas(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Services Table
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

-- 6. Saved Workers & Service Requests
CREATE TABLE IF NOT EXISTS public.saved_workers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE NOT NULL,
  worker_id UUID REFERENCES public.workers(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(client_id, worker_id)
);

CREATE TABLE IF NOT EXISTS public.service_requests (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL,
  budget_min NUMERIC,
  budget_max NUMERIC,
  location_address TEXT,
  status TEXT DEFAULT 'open',
  scheduled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. Bookings and Timelines
CREATE TABLE IF NOT EXISTS public.bookings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  request_id UUID REFERENCES public.service_requests(id) ON DELETE SET NULL,
  client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE NOT NULL,
  worker_id UUID REFERENCES public.workers(id) ON DELETE CASCADE NOT NULL,
  status TEXT DEFAULT 'pending',
  total_price NUMERIC NOT NULL,
  scheduled_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  city_id UUID REFERENCES public.cities(id)
);

CREATE TABLE IF NOT EXISTS public.booking_timeline (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  booking_id UUID REFERENCES public.bookings(id) ON DELETE CASCADE NOT NULL,
  status TEXT NOT NULL,
  reason TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. Conversations and Messaging
CREATE TABLE IF NOT EXISTS public.conversations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  booking_id UUID REFERENCES public.bookings(id) ON DELETE SET NULL,
  participant_ids UUID[] NOT NULL,
  last_message_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id UUID REFERENCES public.conversations(id) ON DELETE CASCADE NOT NULL,
  sender_id UUID REFERENCES public.profiles(id) NOT NULL,
  content TEXT NOT NULL,
  status TEXT DEFAULT 'sent',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.message_read_receipts (
  message_id UUID REFERENCES public.messages(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES public.profiles(id) NOT NULL,
  read_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (message_id, user_id)
);

-- 9. Notifications
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  link_url TEXT,
  is_read BOOLEAN DEFAULT FALSE,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 10. Reviews
CREATE TABLE IF NOT EXISTS public.reviews (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  booking_id UUID REFERENCES public.bookings(id) ON DELETE CASCADE NOT NULL,
  reviewer_id UUID REFERENCES public.profiles(id) NOT NULL,
  worker_id UUID REFERENCES public.workers(id) NOT NULL,
  rating INTEGER CHECK (rating >= 1 AND rating <= 5) NOT NULL,
  comment TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT unique_booking_review UNIQUE(booking_id)
);

-- 11. Enable Row Level Security (RLS) on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saved_workers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booking_timeline ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_read_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;

-- 12. Create Basic RLS Policies (to allow access during development)
CREATE POLICY "Public profiles are viewable by everyone" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "Users can insert their own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Workers are viewable by everyone" ON public.workers FOR SELECT USING (true);
CREATE POLICY "Workers can insert own data" ON public.workers FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "Workers can update own data" ON public.workers FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Clients can view own data" ON public.clients FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Clients can insert own data" ON public.clients FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "Clients can update own data" ON public.clients FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Services are viewable by everyone" ON public.services FOR SELECT USING (true);
CREATE POLICY "Workers can manage their own services" ON public.services FOR ALL USING (auth.uid() = worker_id);

CREATE POLICY "Clients can view their saved workers" ON public.saved_workers FOR SELECT USING (auth.uid() = client_id);
CREATE POLICY "Clients can save workers" ON public.saved_workers FOR INSERT WITH CHECK (auth.uid() = client_id);
CREATE POLICY "Clients can remove saved workers" ON public.saved_workers FOR DELETE USING (auth.uid() = client_id);

CREATE POLICY "Clients can view their own requests" ON public.service_requests FOR SELECT USING (auth.uid() = client_id);
CREATE POLICY "Clients can create requests" ON public.service_requests FOR INSERT WITH CHECK (auth.uid() = client_id);
CREATE POLICY "Clients can update their requests" ON public.service_requests FOR UPDATE USING (auth.uid() = client_id);

CREATE POLICY "Clients can view their own bookings" ON public.bookings FOR SELECT USING (auth.uid() = client_id);
CREATE POLICY "Workers can view their assigned bookings" ON public.bookings FOR SELECT USING (auth.uid() = worker_id);
CREATE POLICY "Clients can create bookings" ON public.bookings FOR INSERT WITH CHECK (auth.uid() = client_id);
CREATE POLICY "Participants can update booking status" ON public.bookings FOR UPDATE USING (auth.uid() = client_id OR auth.uid() = worker_id);

CREATE POLICY "Participants can view booking timeline" ON public.booking_timeline FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.bookings b 
    WHERE b.id = booking_id 
    AND (b.client_id = auth.uid() OR b.worker_id = auth.uid())
  )
);

CREATE POLICY "Users can view their own conversations" ON public.conversations FOR SELECT USING (auth.uid() = ANY(participant_ids));
CREATE POLICY "Users can view messages in their conversations" ON public.messages FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.conversations c 
    WHERE c.id = conversation_id AND auth.uid() = ANY(c.participant_ids)
  )
);
CREATE POLICY "Users can send messages to their conversations" ON public.messages FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.conversations c 
    WHERE c.id = conversation_id AND auth.uid() = ANY(c.participant_ids)
  )
);

CREATE POLICY "Users can view their own notifications" ON public.notifications FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can update their own notifications" ON public.notifications FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Reviews are viewable by everyone" ON public.reviews FOR SELECT USING (true);
CREATE POLICY "Clients can create reviews for their completed bookings" ON public.reviews FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.bookings b 
    WHERE b.id = booking_id 
    AND b.client_id = auth.uid() 
    AND b.status = 'completed'
  )
);

-- 13. Create handle_new_user function and trigger
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

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
