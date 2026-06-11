-- 1. Enable Row Level Security (RLS) on missing platform config and location metadata tables
ALTER TABLE public.platform_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.countries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.states ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.areas ENABLE ROW LEVEL SECURITY;

-- 2. Create basic read-only policies for public SELECT, restricting write access to administrators (service_role)
DROP POLICY IF EXISTS "Platform configuration is readable by everyone" ON public.platform_config;
CREATE POLICY "Platform configuration is readable by everyone" ON public.platform_config
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Countries are readable by everyone" ON public.countries;
CREATE POLICY "Countries are readable by everyone" ON public.countries
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "States are readable by everyone" ON public.states;
CREATE POLICY "States are readable by everyone" ON public.states
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Cities are readable by everyone" ON public.cities;
CREATE POLICY "Cities are readable by everyone" ON public.cities
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Areas are readable by everyone" ON public.areas;
CREATE POLICY "Areas are readable by everyone" ON public.areas
  FOR SELECT USING (true);

-- 3. Restrict SELECT policy on public.profiles to prevent public PII harvesting
-- Drop the wide open "Public profiles are viewable by everyone" policy
DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON public.profiles;

-- Anyone can see their own profile
DROP POLICY IF EXISTS "Own profile is viewable by self" ON public.profiles;
CREATE POLICY "Own profile is viewable by self" ON public.profiles
  FOR SELECT USING (auth.uid() = id);

-- Anyone can view worker profiles (since they are public service providers)
DROP POLICY IF EXISTS "Worker profiles are viewable by everyone" ON public.profiles;
CREATE POLICY "Worker profiles are viewable by everyone" ON public.profiles
  FOR SELECT USING (role = 'worker');

-- Workers can view profiles of clients who have booked them
DROP POLICY IF EXISTS "Client profiles are viewable by assigned worker" ON public.profiles;
CREATE POLICY "Client profiles are viewable by assigned worker" ON public.profiles
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.bookings b
      WHERE b.client_id = id AND b.worker_id = auth.uid()
    )
  );

-- Users can view profiles of people in their active chat conversations
DROP POLICY IF EXISTS "Profiles are viewable by conversation participants" ON public.profiles;
CREATE POLICY "Profiles are viewable by conversation participants" ON public.profiles
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE auth.uid() = ANY(c.participant_ids) AND id = ANY(c.participant_ids)
    )
  );

-- 4. Triggers for role protection, worker verification, and booking immutability

-- Trigger: protect_profile_roles
-- Prevents standard users from modifying their own role (only service role or admin can write it)
CREATE OR REPLACE FUNCTION public.protect_profile_roles() 
RETURNS TRIGGER AS $$
BEGIN
  IF auth.role() = 'authenticated' AND (
    NEW.role IS DISTINCT FROM OLD.role OR
    (OLD.role IS NULL AND NEW.role IS NOT NULL)
  ) THEN
    RAISE EXCEPTION 'You are not authorized to modify your profile role.';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS tr_protect_profile_roles ON public.profiles;
CREATE TRIGGER tr_protect_profile_roles
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_profile_roles();

-- Trigger: protect_worker_fields
-- Prevents workers from self-verifying themselves (verified = true)
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

-- Trigger: protect_booking_immutability
-- Prevents clients or workers from editing the pricing or links of a booking after creation
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
