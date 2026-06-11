-- Migration: 20260610_harden_auth_onboarding.sql
-- Hardens the onboarding trigger, RLS-safety, and role protection system.

-- 1. Ensure public.profiles table contains all the correct columns and types
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS role user_role DEFAULT 'client';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS onboarded BOOLEAN DEFAULT FALSE;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS username TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- 2. Add unique constraint index on username if not exists
CREATE UNIQUE INDEX IF NOT EXISTS profiles_username_unique_idx ON public.profiles(username);

-- 3. Resilient default constraint for username to avoid nulls
ALTER TABLE public.profiles 
  ALTER COLUMN username SET DEFAULT ('user_' || substring(gen_random_uuid()::text, 1, 8));

-- 4. Re-create handle_new_user function with robust fallback, phone-only support, and phone conflict prevention
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  default_username TEXT;
  phone_val TEXT;
  email_val TEXT;
  phone_exists BOOLEAN;
BEGIN
  -- Extract phone and email
  phone_val := COALESCE(NEW.phone, NEW.raw_user_meta_data->>'phone');
  email_val := NEW.email;

  -- Ensure a unique default username
  default_username := COALESCE(
    NEW.raw_user_meta_data->>'username',
    'user_' || COALESCE(split_part(email_val, '@', 1), substring(NEW.id::text, 1, 8)) || '_' || floor(random()*1000)::text
  );

  -- Prevent duplicate key value violates unique constraint "profiles_phone_key"
  IF phone_val IS NOT NULL THEN
    SELECT EXISTS(SELECT 1 FROM public.profiles WHERE phone = phone_val AND id != NEW.id) INTO phone_exists;
    IF phone_exists THEN
      -- Log warning and set phone to NULL to prevent trigger error and save user signup
      RAISE WARNING 'Phone number % is already in use. Setting profile phone to NULL for user %', phone_val, NEW.id;
      phone_val := NULL;
    END IF;
  END IF;

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

-- 6. Drop and recreate triggers to ensure they point to the newly updated functions
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

DROP TRIGGER IF EXISTS tr_protect_profile_roles ON public.profiles;
CREATE TRIGGER tr_protect_profile_roles
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_profile_roles();
