-- Migration to decouple public.profiles from auth.users and use Firebase Auth

-- 1. Add firebase_uid to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS firebase_uid TEXT UNIQUE;

-- 2. Drop the foreign key constraint from profiles to auth.users
-- The constraint name is usually "profiles_id_fkey"
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_id_fkey;

-- 3. Add auto-generation for UUID so profiles can be created independently of auth.users
ALTER TABLE public.profiles ALTER COLUMN id SET DEFAULT gen_random_uuid();

-- 4. Update RLS policies to allow profile operations based on firebase_uid
-- Since we are bypassing Supabase Auth, auth.uid() will be null.
-- We must allow anon access for inserting profiles, or ideally handle it via a secure backend API.
-- For client-side compatibility as requested:
DROP POLICY IF EXISTS "Users can insert their own profile." ON public.profiles;
CREATE POLICY "Users can insert their own profile." ON public.profiles
  FOR INSERT WITH CHECK (true); -- Note: In a production app, use a service_role API instead of allowing public inserts

DROP POLICY IF EXISTS "Users can update own profile." ON public.profiles;
CREATE POLICY "Users can update own profile." ON public.profiles
  FOR UPDATE USING (true); -- Note: In a production app, use a service_role API instead of allowing public updates
