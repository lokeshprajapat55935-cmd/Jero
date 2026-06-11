-- 1. Add firebase_uid column if missing
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS firebase_uid TEXT UNIQUE;

-- 2. Drop the foreign key constraint that forces profiles to exist in Supabase auth.users
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_id_fkey;

-- 3. Ensure the UUID is auto-generated so we don't have to provide one
ALTER TABLE public.profiles ALTER COLUMN id SET DEFAULT gen_random_uuid();

-- 4. Drop the old Supabase Auth-dependent RLS policies
DROP POLICY IF EXISTS "Public profiles are viewable by everyone." ON public.profiles;
DROP POLICY IF EXISTS "Users can insert their own profile." ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile." ON public.profiles;

-- 5. Create development-safe RLS policies that bypass Supabase Auth constraints
-- Allow anyone to read profiles
CREATE POLICY "Allow public SELECT on profiles" 
  ON public.profiles FOR SELECT 
  USING (true);

-- Allow anyone to insert (development mode)
CREATE POLICY "Allow public INSERT on profiles" 
  ON public.profiles FOR INSERT 
  WITH CHECK (true);

-- Allow anyone to update their profile (development mode)
CREATE POLICY "Allow public UPDATE on profiles" 
  ON public.profiles FOR UPDATE 
  USING (true);
