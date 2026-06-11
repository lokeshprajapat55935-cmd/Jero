-- Zolvo Clean Database Recovery Script
-- Safe to execute directly in the Supabase SQL Editor.

-- 1. Custom Roles Enum & Table Alterations
DO $$ 
BEGIN 
  CREATE TYPE user_role AS ENUM ('client', 'worker', 'admin'); 
EXCEPTION 
  WHEN duplicate_object THEN null; 
END $$;

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS full_name TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS avatar_url TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS phone_verified BOOLEAN DEFAULT FALSE;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'client';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS onboarded BOOLEAN DEFAULT FALSE;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS username TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS location_name TEXT;

ALTER TABLE public.profiles ALTER COLUMN email DROP NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_username_unique_idx ON public.profiles(username);
CREATE UNIQUE INDEX IF NOT EXISTS profiles_phone_unique_idx ON public.profiles(phone) WHERE phone IS NOT NULL;

-- 2. Location Tables & Core Configuration
CREATE TABLE IF NOT EXISTS public.countries (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  dial_code TEXT,
  currency_code TEXT DEFAULT 'INR',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.states (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  country_id UUID NOT NULL REFERENCES public.countries(id),
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(country_id, code)
);

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

CREATE INDEX IF NOT EXISTS idx_areas_city_id ON public.areas(city_id);
CREATE INDEX IF NOT EXISTS idx_areas_slug ON public.areas(slug);

CREATE TABLE IF NOT EXISTS public.platform_config (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  key TEXT UNIQUE NOT NULL,
  value TEXT,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Core Application Tables
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
  moderation_note TEXT,
  search_vector tsvector,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_workers_city_id ON public.workers(city_id);
CREATE INDEX IF NOT EXISTS idx_workers_area_id ON public.workers(area_id);

CREATE TABLE IF NOT EXISTS public.clients (
  id UUID REFERENCES public.profiles(id) ON DELETE CASCADE PRIMARY KEY,
  address TEXT,
  phone TEXT,
  city_id UUID REFERENCES public.cities(id),
  area_id UUID REFERENCES public.areas(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_clients_city_id ON public.clients(city_id);

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
  city_id UUID REFERENCES public.cities(id),
  category TEXT,
  description TEXT,
  base_service_charge NUMERIC DEFAULT 0,
  visit_charge NUMERIC DEFAULT 0,
  payment_method TEXT DEFAULT 'cash',
  payment_status TEXT DEFAULT 'pending'
);

CREATE TABLE IF NOT EXISTS public.booking_timeline (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  booking_id UUID REFERENCES public.bookings(id) ON DELETE CASCADE NOT NULL,
  status TEXT NOT NULL,
  reason TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Messaging & Reviews
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

-- 5. Emergency Dispatch System
CREATE TABLE IF NOT EXISTS public.emergency_requests (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE NOT NULL,
  category TEXT NOT NULL,
  location_address TEXT,
  latitude NUMERIC,
  longitude NUMERIC,
  city_id UUID REFERENCES public.cities(id),
  area_id UUID REFERENCES public.areas(id),
  status TEXT DEFAULT 'dispatching' NOT NULL,
  accepted_worker_id UUID REFERENCES public.workers(id),
  accepted_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '60 seconds'),
  notified_worker_count INTEGER DEFAULT 0,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.emergency_acceptances (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  emergency_request_id UUID REFERENCES public.emergency_requests(id) ON DELETE CASCADE NOT NULL,
  worker_id UUID REFERENCES public.workers(id) ON DELETE CASCADE NOT NULL,
  accepted BOOLEAN DEFAULT FALSE,
  result TEXT DEFAULT 'pending' NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(emergency_request_id, worker_id)
);

ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS emergency_request_id UUID REFERENCES public.emergency_requests(id) ON DELETE SET NULL;

-- 6. Audit Logs, Categories & Analytics
CREATE TABLE IF NOT EXISTS public.auth_audit_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  phone TEXT,
  event_type TEXT NOT NULL,
  ip_hash TEXT,
  user_agent TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.service_categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  icon TEXT,
  sort_order INT DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.analytics_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  anonymous_id TEXT,
  event_name TEXT NOT NULL,
  properties JSONB DEFAULT '{}',
  user_agent TEXT,
  ip_address TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. Database Performance Indexes
CREATE INDEX IF NOT EXISTS idx_workers_category_status ON public.workers(category, status);
CREATE INDEX IF NOT EXISTS idx_workers_rating_avg ON public.workers(rating_avg DESC);
CREATE INDEX IF NOT EXISTS idx_workers_geo_dispatch ON public.workers(category, status, city_id, area_id);
CREATE INDEX IF NOT EXISTS idx_bookings_status_scheduled ON public.bookings(status, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_bookings_created_at ON public.bookings(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bookings_emergency_request ON public.bookings(emergency_request_id);
CREATE INDEX IF NOT EXISTS idx_reviews_worker_rating ON public.reviews(worker_id, rating);
CREATE INDEX IF NOT EXISTS idx_conversations_last_message ON public.conversations(last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_conversation_id_created_at ON public.messages(conversation_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_emergency_requests_client_created ON public.emergency_requests(client_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_emergency_requests_dispatch ON public.emergency_requests(category, city_id, area_id, status, expires_at);
CREATE INDEX IF NOT EXISTS idx_emergency_requests_status_expires ON public.emergency_requests(status, expires_at);
CREATE INDEX IF NOT EXISTS idx_emergency_requests_client ON public.emergency_requests(client_id, status);
CREATE INDEX IF NOT EXISTS idx_emergency_acceptances_request ON public.emergency_acceptances(emergency_request_id, created_at);
CREATE INDEX IF NOT EXISTS idx_notifications_emergency ON public.notifications((metadata->>'emergency_request_id')) WHERE type = 'emergency_request';
CREATE INDEX IF NOT EXISTS auth_audit_events_user_created_idx ON public.auth_audit_events (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS auth_audit_events_phone_created_idx ON public.auth_audit_events (phone, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_events_name_time ON public.analytics_events(event_name, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_events_user_id ON public.analytics_events(user_id);

-- 8. Row Level Security (RLS) Enablement
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.countries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.states ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.areas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_config ENABLE ROW LEVEL SECURITY;
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
ALTER TABLE public.emergency_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.emergency_acceptances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auth_audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analytics_events ENABLE ROW LEVEL SECURITY;

-- 9. Row Level Security Policies
DROP POLICY IF EXISTS "Own profile is viewable by self" ON public.profiles;
CREATE POLICY "Own profile is viewable by self" ON public.profiles FOR SELECT USING (auth.uid() = id);

DROP POLICY IF EXISTS "Worker profiles are viewable by everyone" ON public.profiles;
CREATE POLICY "Worker profiles are viewable by everyone" ON public.profiles FOR SELECT USING (role = 'worker');

DROP POLICY IF EXISTS "Client profiles are viewable by assigned worker" ON public.profiles;
CREATE POLICY "Client profiles are viewable by assigned worker" ON public.profiles FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.bookings b
    WHERE b.client_id = id AND b.worker_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Profiles are viewable by conversation participants" ON public.profiles;
CREATE POLICY "Profiles are viewable by conversation participants" ON public.profiles FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.conversations c
    WHERE auth.uid() = ANY(c.participant_ids) AND id = ANY(c.participant_ids)
  )
);

DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
CREATE POLICY "Users can insert their own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);

DROP POLICY IF EXISTS "Countries are readable by everyone" ON public.countries;
CREATE POLICY "Countries are readable by everyone" ON public.countries FOR SELECT USING (true);

DROP POLICY IF EXISTS "States are readable by everyone" ON public.states;
CREATE POLICY "States are readable by everyone" ON public.states FOR SELECT USING (true);

DROP POLICY IF EXISTS "Cities are readable by everyone" ON public.cities;
CREATE POLICY "Cities are readable by everyone" ON public.cities FOR SELECT USING (true);

DROP POLICY IF EXISTS "Areas are readable by everyone" ON public.areas;
CREATE POLICY "Areas are readable by everyone" ON public.areas FOR SELECT USING (true);

DROP POLICY IF EXISTS "Platform configuration is readable by everyone" ON public.platform_config;
CREATE POLICY "Platform configuration is readable by everyone" ON public.platform_config FOR SELECT USING (true);

DROP POLICY IF EXISTS "Only admins can update platform config" ON public.platform_config;
CREATE POLICY "Only admins can update platform config" ON public.platform_config FOR UPDATE USING (
  auth.jwt() ->> 'role' = 'admin' OR
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
);

DROP POLICY IF EXISTS "Workers are viewable by everyone" ON public.workers;
CREATE POLICY "Workers are viewable by everyone" ON public.workers FOR SELECT USING (true);

DROP POLICY IF EXISTS "Workers can insert own data" ON public.workers;
CREATE POLICY "Workers can insert own data" ON public.workers FOR INSERT WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Workers can update own data" ON public.workers;
CREATE POLICY "Workers can update own data" ON public.workers FOR UPDATE USING (auth.uid() = id);

DROP POLICY IF EXISTS "Clients can view own data" ON public.clients;
CREATE POLICY "Clients can view own data" ON public.clients FOR SELECT USING (auth.uid() = id);

DROP POLICY IF EXISTS "Clients can insert own data" ON public.clients;
CREATE POLICY "Clients can insert own data" ON public.clients FOR INSERT WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Clients can update own data" ON public.clients;
CREATE POLICY "Clients can update own data" ON public.clients FOR UPDATE USING (auth.uid() = id);

DROP POLICY IF EXISTS "Services are viewable by everyone" ON public.services;
CREATE POLICY "Services are viewable by everyone" ON public.services FOR SELECT USING (true);

DROP POLICY IF EXISTS "Workers can manage their own services" ON public.services;
CREATE POLICY "Workers can manage their own services" ON public.services FOR ALL USING (auth.uid() = worker_id);

DROP POLICY IF EXISTS "Clients can view their saved workers" ON public.saved_workers;
CREATE POLICY "Clients can view their saved workers" ON public.saved_workers FOR SELECT USING (auth.uid() = client_id);

DROP POLICY IF EXISTS "Clients can save workers" ON public.saved_workers;
CREATE POLICY "Clients can save workers" ON public.saved_workers FOR INSERT WITH CHECK (auth.uid() = client_id);

DROP POLICY IF EXISTS "Clients can remove saved workers" ON public.saved_workers;
CREATE POLICY "Clients can remove saved workers" ON public.saved_workers FOR DELETE USING (auth.uid() = client_id);

DROP POLICY IF EXISTS "Clients can view their own requests" ON public.service_requests;
CREATE POLICY "Clients can view their own requests" ON public.service_requests FOR SELECT USING (auth.uid() = client_id);

DROP POLICY IF EXISTS "Clients can create requests" ON public.service_requests;
CREATE POLICY "Clients can create requests" ON public.service_requests FOR INSERT WITH CHECK (auth.uid() = client_id);

DROP POLICY IF EXISTS "Clients can update their requests" ON public.service_requests;
CREATE POLICY "Clients can update their requests" ON public.service_requests FOR UPDATE USING (auth.uid() = client_id);

DROP POLICY IF EXISTS "Clients can view their own bookings" ON public.bookings;
CREATE POLICY "Clients can view their own bookings" ON public.bookings FOR SELECT USING (auth.uid() = client_id);

DROP POLICY IF EXISTS "Workers can view their assigned bookings" ON public.bookings;
CREATE POLICY "Workers can view their assigned bookings" ON public.bookings FOR SELECT USING (auth.uid() = worker_id);

DROP POLICY IF EXISTS "Clients can create bookings" ON public.bookings;
CREATE POLICY "Clients can create bookings" ON public.bookings FOR INSERT WITH CHECK (auth.uid() = client_id);

DROP POLICY IF EXISTS "Participants can update booking status" ON public.bookings;
CREATE POLICY "Participants can update booking status" ON public.bookings FOR UPDATE USING (auth.uid() = client_id OR auth.uid() = worker_id);

DROP POLICY IF EXISTS "Participants can view booking timeline" ON public.booking_timeline;
CREATE POLICY "Participants can view booking timeline" ON public.booking_timeline FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.bookings b 
    WHERE b.id = booking_id 
    AND (b.client_id = auth.uid() OR b.worker_id = auth.uid())
  )
);

DROP POLICY IF EXISTS "Users can view their own conversations" ON public.conversations;
CREATE POLICY "Users can view their own conversations" ON public.conversations FOR SELECT USING (auth.uid() = ANY(participant_ids));

DROP POLICY IF EXISTS "Users can view messages in their conversations" ON public.messages;
CREATE POLICY "Users can view messages in their conversations" ON public.messages FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.conversations c 
    WHERE c.id = conversation_id AND auth.uid() = ANY(c.participant_ids)
  )
);

DROP POLICY IF EXISTS "Users can send messages to their conversations" ON public.messages;
CREATE POLICY "Users can send messages to their conversations" ON public.messages FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.conversations c 
    WHERE c.id = conversation_id AND auth.uid() = ANY(c.participant_ids)
  )
);

DROP POLICY IF EXISTS "Users can view their own notifications" ON public.notifications;
CREATE POLICY "Users can view their own notifications" ON public.notifications FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own notifications" ON public.notifications;
CREATE POLICY "Users can update their own notifications" ON public.notifications FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Reviews are viewable by everyone" ON public.reviews;
CREATE POLICY "Reviews are viewable by everyone" ON public.reviews FOR SELECT USING (true);

DROP POLICY IF EXISTS "Clients can create reviews for their completed bookings" ON public.reviews;
CREATE POLICY "Clients can create reviews for their completed bookings" ON public.reviews FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.bookings b 
    WHERE b.id = booking_id 
    AND b.client_id = auth.uid() 
    AND b.status = 'completed'
  )
);

DROP POLICY IF EXISTS "Clients can create emergency requests" ON public.emergency_requests;
CREATE POLICY "Clients can create emergency requests" ON public.emergency_requests FOR INSERT WITH CHECK (auth.uid() = client_id);

DROP POLICY IF EXISTS "Emergency participants can view requests" ON public.emergency_requests;
CREATE POLICY "Emergency participants can view requests" ON public.emergency_requests FOR SELECT USING (auth.uid() = client_id OR auth.uid() = accepted_worker_id);

DROP POLICY IF EXISTS "Workers can view own emergency acceptances" ON public.emergency_acceptances;
CREATE POLICY "Workers can view own emergency acceptances" ON public.emergency_acceptances FOR SELECT USING (auth.uid() = worker_id);

DROP POLICY IF EXISTS "Workers can insert own emergency acceptances" ON public.emergency_acceptances;
CREATE POLICY "Workers can insert own emergency acceptances" ON public.emergency_acceptances FOR INSERT WITH CHECK (auth.uid() = worker_id);

DROP POLICY IF EXISTS "Users can view own auth audit events" ON public.auth_audit_events;
CREATE POLICY "Users can view own auth audit events" ON public.auth_audit_events FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Categories are public" ON public.service_categories;
CREATE POLICY "Categories are public" ON public.service_categories FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users can insert their own analytics events" ON public.analytics_events;
CREATE POLICY "Users can insert their own analytics events" ON public.analytics_events FOR INSERT WITH CHECK (auth.uid() = user_id OR user_id IS NULL);

DROP POLICY IF EXISTS "Only admins can view analytics events" ON public.analytics_events;
CREATE POLICY "Only admins can view analytics events" ON public.analytics_events FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
);

-- 10. Triggers & Helper Functions
CREATE OR REPLACE FUNCTION public.worker_search_trigger() 
RETURNS TRIGGER AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('english', COALESCE(NEW.category, '')), 'A') ||
    setweight(to_tsvector('english', COALESCE(NEW.bio, '')), 'B');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS worker_search_update ON public.workers;
CREATE TRIGGER worker_search_update BEFORE INSERT OR UPDATE
ON public.workers FOR EACH ROW EXECUTE FUNCTION public.worker_search_trigger();

CREATE OR REPLACE FUNCTION public.protect_profile_roles() 
RETURNS TRIGGER AS $$
BEGIN
  -- Standard users (authenticated role) can NEVER set their role to 'admin'
  IF auth.role() = 'authenticated' AND NEW.role = 'admin' AND (
    OLD.role IS DISTINCT FROM NEW.role OR OLD.role IS NULL
  ) THEN
    RAISE EXCEPTION 'You are not authorized to assign the admin role.';
  END IF;

  -- Once onboarding is completed (OLD.onboarded is true), standard users (authenticated)
  -- cannot change their role or set onboarded back to false.
  IF auth.role() = 'authenticated' AND OLD.onboarded = TRUE AND (
    NEW.role IS DISTINCT FROM OLD.role OR
    NEW.onboarded = FALSE
  ) THEN
    RAISE EXCEPTION 'You are not authorized to modify your profile role or revert your onboarding status after completion.';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS tr_protect_profile_roles ON public.profiles;
CREATE TRIGGER tr_protect_profile_roles
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_profile_roles();

CREATE OR REPLACE FUNCTION public.protect_worker_fields() 
RETURNS TRIGGER AS $$
BEGIN
  IF auth.role() = 'authenticated' AND (
    NEW.verified IS DISTINCT FROM OLD.verified OR
    (OLD.verified IS NULL AND NEW.verified IS NOT NULL)
  ) THEN
    RAISE EXCEPTION 'You are not authorized to change worker verification status.';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS tr_protect_worker_fields ON public.workers;
CREATE TRIGGER tr_protect_worker_fields
  BEFORE UPDATE ON public.workers
  FOR EACH ROW EXECUTE FUNCTION public.protect_worker_fields();

CREATE OR REPLACE FUNCTION public.protect_booking_immutability()
RETURNS TRIGGER AS $$
BEGIN
  IF auth.role() = 'authenticated' AND (
    NEW.client_id IS DISTINCT FROM OLD.client_id OR
    NEW.worker_id IS DISTINCT FROM OLD.worker_id OR
    NEW.total_price IS DISTINCT FROM OLD.total_price OR
    NEW.emergency_request_id IS DISTINCT FROM OLD.emergency_request_id
  ) THEN
    RAISE EXCEPTION 'Cannot modify client_id, worker_id, total_price, or emergency_request_id of a booking.';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS tr_protect_booking_immutability ON public.bookings;
CREATE TRIGGER tr_protect_booking_immutability
  BEFORE UPDATE ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.protect_booking_immutability();

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, avatar_url, phone, phone_verified, username)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'avatar_url',
    COALESCE(NEW.phone, NEW.raw_user_meta_data->>'phone'),
    COALESCE(NEW.phone_confirmed_at IS NOT NULL, FALSE),
    COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1) || floor(random()*1000)::text)
  )
  ON CONFLICT (id) DO UPDATE SET
    email = COALESCE(EXCLUDED.email, public.profiles.email),
    full_name = COALESCE(EXCLUDED.full_name, public.profiles.full_name),
    avatar_url = COALESCE(EXCLUDED.avatar_url, public.profiles.avatar_url),
    phone = COALESCE(EXCLUDED.phone, public.profiles.phone),
    phone_verified = public.profiles.phone_verified OR EXCLUDED.phone_verified,
    updated_at = NOW();

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

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

-- 11. Seed & Reference Data (India, Rajasthan, Bhilwara)
INSERT INTO public.countries (code, name, dial_code, currency_code)
VALUES ('IN', 'India', '+91', 'INR')
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.states (country_id, code, name)
SELECT id, 'RJ', 'Rajasthan' FROM public.countries WHERE code = 'IN'
ON CONFLICT (country_id, code) DO NOTHING;

INSERT INTO public.platform_config (key, value, description)
VALUES 
  ('active_city_slug', 'bhilwara', 'Currently active city for the platform'),
  ('active_city_mode', 'single', 'Platform mode: single or multi-city')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

INSERT INTO public.service_categories (id, name, slug, icon, sort_order) 
VALUES
  ('electrician', 'Electrician', 'Electrician', 'zap', 1),
  ('plumber', 'Plumber', 'Plumber', 'droplets', 2),
  ('labour', 'Labour', 'Labour', 'hard-hat', 3)
ON CONFLICT (id) DO NOTHING;

DO $$
DECLARE
  rajasthan_id UUID;
  bhilwara_city_id UUID;
BEGIN
  SELECT id INTO rajasthan_id FROM public.states WHERE code = 'RJ' LIMIT 1;
  
  INSERT INTO public.cities (state_id, name, slug, description, is_active, latitude, longitude)
  VALUES (rajasthan_id, 'Bhilwara', 'bhilwara', 'Professional local services in Bhilwara, Rajasthan', TRUE, 25.3596, 74.6319)
  ON CONFLICT (slug) DO UPDATE SET is_active = TRUE
  RETURNING id INTO bhilwara_city_id;
  
  IF bhilwara_city_id IS NULL THEN
    SELECT id INTO bhilwara_city_id FROM public.cities WHERE slug = 'bhilwara' LIMIT 1;
  END IF;
  
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
