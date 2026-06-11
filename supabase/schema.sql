/**
 * Supabase Database Schema
 * Run this in your Supabase SQL Editor
 */

-- Profiles table (Extends auth.users)
CREATE TABLE public.profiles (
  id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  email TEXT UNIQUE,
  full_name TEXT,
  avatar_url TEXT,
  phone TEXT UNIQUE,
  phone_verified BOOLEAN DEFAULT FALSE,
  role TEXT DEFAULT 'client' CHECK (role IN ('client', 'worker', 'admin')),
  onboarded BOOLEAN DEFAULT FALSE,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Policies for profiles
CREATE POLICY "Public profiles are viewable by everyone." ON public.profiles
  FOR SELECT USING (true);

CREATE POLICY "Users can insert their own profile." ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update own profile." ON public.profiles
  FOR UPDATE USING (auth.uid() = id);

-- Workers table
CREATE TABLE public.workers (
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
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.workers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Workers are viewable by everyone." ON public.workers
  FOR SELECT USING (true);

CREATE POLICY "Workers can update own data." ON public.workers
  FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Workers can insert own data." ON public.workers
  FOR INSERT WITH CHECK (auth.uid() = id);

-- Clients table
CREATE TABLE public.clients (
  id UUID REFERENCES public.profiles(id) ON DELETE CASCADE PRIMARY KEY,
  address TEXT,
  phone TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Clients can view own data." ON public.clients
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Clients can update own data." ON public.clients
  FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Clients can insert own data." ON public.clients
  FOR INSERT WITH CHECK (auth.uid() = id);

-- Function to handle new user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, avatar_url, phone, phone_verified)
  VALUES (
    NEW.id,
    COALESCE(NEW.email, CONCAT(NEW.id::TEXT, '@phone.zolvo.local')),
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'avatar_url',
    COALESCE(NEW.phone, NEW.raw_user_meta_data->>'phone'),
    COALESCE(NEW.phone_confirmed_at IS NOT NULL, FALSE)
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to call handle_new_user on signup
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
