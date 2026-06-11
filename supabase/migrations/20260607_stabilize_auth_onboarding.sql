-- Migration: 20260607_stabilize_auth_onboarding.sql
-- Hardens the onboarding trigger and role protection system.

-- 1. Ensure public.profiles table contains all the correct columns and types
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS role user_role DEFAULT 'client';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS onboarded BOOLEAN DEFAULT FALSE;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS username TEXT;

-- 2. Add unique constraint index on username if not exists
CREATE UNIQUE INDEX IF NOT EXISTS profiles_username_unique_idx ON public.profiles(username);

-- 3. Resilient default constraint for username to avoid nulls
ALTER TABLE public.profiles 
  ALTER COLUMN username SET DEFAULT ('user_' || substring(gen_random_uuid()::text, 1, 8));

-- 4. Re-create handle_new_user function with robust fallback and phone-only support
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  default_username TEXT;
  phone_val TEXT;
  email_val TEXT;
BEGIN
  -- Extract phone and email
  phone_val := COALESCE(NEW.phone, NEW.raw_user_meta_data->>'phone');
  email_val := NEW.email;

  -- Ensure a unique default username
  default_username := COALESCE(
    NEW.raw_user_meta_data->>'username',
    'user_' || COALESCE(split_part(email_val, '@', 1), substring(NEW.id::text, 1, 8)) || '_' || floor(random()*1000)::text
  );

  -- Insert profile, or update on conflict to prevent duplicate/desync errors
  INSERT INTO public.profiles (
    id, 
    email, 
    full_name, 
    avatar_url, 
    phone, 
    phone_verified, 
    username, 
    role, 
    onboarded,
    created_at,
    updated_at
  )
  VALUES (
    NEW.id,
    email_val,
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'avatar_url',
    phone_val,
    COALESCE(NEW.phone_confirmed_at IS NOT NULL, FALSE),
    default_username,
    'client',
    FALSE,
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO UPDATE SET
    email = COALESCE(EXCLUDED.email, public.profiles.email),
    full_name = COALESCE(EXCLUDED.full_name, public.profiles.full_name),
    avatar_url = COALESCE(EXCLUDED.avatar_url, public.profiles.avatar_url),
    phone = COALESCE(EXCLUDED.phone, public.profiles.phone),
    phone_verified = public.profiles.phone_verified OR EXCLUDED.phone_verified,
    updated_at = NOW();

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Catch all errors gracefully to prevent blocking Auth user creation flow
  RAISE WARNING 'Error in handle_new_user trigger for user ID %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Re-create protect_profile_roles to allow updates during onboarding phase but lock role afterwards
CREATE OR REPLACE FUNCTION public.protect_profile_roles() 
RETURNS TRIGGER AS $$
BEGIN
  -- Standard users (authenticated role) can NEVER set their role to 'admin'
  IF auth.role() = 'authenticated' AND NEW.role = 'admin'::user_role AND (
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
