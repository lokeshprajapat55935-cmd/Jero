-- Migration: 20260626_fix_profiles_rls.sql
-- Description: Break RLS circular loops by flattening profiles table policies

-- 1. Drop all existing policies on public.profiles to clean the slate
DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON public.profiles;
DROP POLICY IF EXISTS "Own profile is viewable by self" ON public.profiles;
DROP POLICY IF EXISTS "Worker profiles are viewable by everyone" ON public.profiles;
DROP POLICY IF EXISTS "Client profiles are viewable by assigned worker" ON public.profiles;
DROP POLICY IF EXISTS "Profiles are viewable by conversation participants" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Allow public SELECT on profiles" ON public.profiles;
DROP POLICY IF EXISTS "Allow public INSERT on profiles" ON public.profiles;
DROP POLICY IF EXISTS "Allow public UPDATE on profiles" ON public.profiles;

-- 2. Create flat, non-recursive SELECT policy
-- Users can read their own profile; admins can read all profiles.
CREATE POLICY "profiles_select_policy" ON public.profiles
  FOR SELECT USING (
    auth.uid() = id OR
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin' OR
    (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin'
  );

-- 3. Create flat, non-recursive UPDATE policy
-- Users can update their own profile; admins can update all profiles.
CREATE POLICY "profiles_update_policy" ON public.profiles
  FOR UPDATE USING (
    auth.uid() = id OR
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin' OR
    (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin'
  );

-- 4. Create flat, non-recursive INSERT policy
-- Users can insert their own profile; admins can insert all profiles.
CREATE POLICY "profiles_insert_policy" ON public.profiles
  FOR INSERT WITH CHECK (
    auth.uid() = id OR
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin' OR
    (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin'
  );
