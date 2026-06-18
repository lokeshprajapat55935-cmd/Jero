-- ============================================================
-- Zolvo Schema Update - RLS Security Hardening
-- ============================================================

-- 1. HARDEN WORKERS TABLE
-- Vulnerability: Workers could modify their rating, review_count, or status directly.
-- Vulnerability: Workers could see all other workers, exposing private information.

DROP POLICY IF EXISTS "Workers are viewable by everyone" ON public.workers;
CREATE POLICY "Workers are viewable by everyone" ON public.workers FOR SELECT USING (
  -- Active and verified workers are public
  (status = 'active' AND verified = true) OR
  -- A worker can see themselves
  (auth.uid() = id) OR
  -- Admins can see everyone
  (auth.jwt() ->> 'role' = 'admin')
);

-- We enhance the trigger to protect more fields
CREATE OR REPLACE FUNCTION public.protect_worker_fields() 
RETURNS TRIGGER AS $$
BEGIN
  IF auth.role() = 'authenticated' AND (
    (NEW.verified IS DISTINCT FROM OLD.verified) OR
    (NEW.rating_avg IS DISTINCT FROM OLD.rating_avg) OR
    (NEW.review_count IS DISTINCT FROM OLD.review_count) OR
    (NEW.status IS DISTINCT FROM OLD.status) OR
    (NEW.moderation_note IS DISTINCT FROM OLD.moderation_note)
  ) THEN
    RAISE EXCEPTION 'You are not authorized to modify restricted worker fields (verified, rating, status, moderation).';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. HARDEN BOOKINGS TABLE
-- Vulnerability: Clients/workers could update booking status, payment status, etc directly.
-- Fix: Remove the permissive UPDATE policy entirely. All state transitions must occur via backend APIs (service_role).

DROP POLICY IF EXISTS "Participants can update booking status" ON public.bookings;
-- No new UPDATE policy created for bookings. Only service_role can update bookings now.

-- Enhance the trigger for extra safety in case a policy is accidentally added in the future
CREATE OR REPLACE FUNCTION public.protect_booking_immutability()
RETURNS TRIGGER AS $$
BEGIN
  IF auth.role() = 'authenticated' AND (
    NEW.client_id IS DISTINCT FROM OLD.client_id OR
    NEW.worker_id IS DISTINCT FROM OLD.worker_id OR
    NEW.total_price IS DISTINCT FROM OLD.total_price OR
    NEW.base_service_charge IS DISTINCT FROM OLD.base_service_charge OR
    NEW.visit_charge IS DISTINCT FROM OLD.visit_charge OR
    NEW.emergency_request_id IS DISTINCT FROM OLD.emergency_request_id OR
    NEW.payment_status IS DISTINCT FROM OLD.payment_status OR
    NEW.payment_method IS DISTINCT FROM OLD.payment_method OR
    NEW.status IS DISTINCT FROM OLD.status
  ) THEN
    RAISE EXCEPTION 'Cannot modify financial, status, or core association fields of a booking directly via client.';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 3. HARDEN PROFILES TABLE
-- Vulnerability: Users could update their `phone_verified` or `onboarded` status manually.
-- Vulnerability: Workers' profiles were completely exposed.

DROP POLICY IF EXISTS "Worker profiles are viewable by everyone" ON public.profiles;

CREATE POLICY "Worker profiles are viewable securely" ON public.profiles FOR SELECT USING (
  role = 'worker' AND (
    -- Admins can view
    (auth.jwt() ->> 'role' = 'admin') OR
    -- The worker themselves
    (auth.uid() = id) OR
    -- Anyone can view if the worker is active and verified
    EXISTS (
      SELECT 1 FROM public.workers w 
      WHERE w.id = public.profiles.id AND w.status = 'active' AND w.verified = true
    )
  )
);

CREATE OR REPLACE FUNCTION public.protect_profile_roles() 
RETURNS TRIGGER AS $$
BEGIN
  IF auth.role() = 'authenticated' AND NEW.role = 'admin' AND (
    OLD.role IS DISTINCT FROM NEW.role OR OLD.role IS NULL
  ) THEN
    RAISE EXCEPTION 'You are not authorized to assign the admin role.';
  END IF;

  IF auth.role() = 'authenticated' AND OLD.onboarded = TRUE AND (
    NEW.role IS DISTINCT FROM OLD.role OR
    NEW.onboarded = FALSE
  ) THEN
    RAISE EXCEPTION 'You are not authorized to modify your profile role or revert your onboarding status after completion.';
  END IF;

  IF auth.role() = 'authenticated' AND (
    NEW.phone_verified IS DISTINCT FROM OLD.phone_verified AND NEW.phone_verified = true
  ) THEN
    RAISE EXCEPTION 'You are not authorized to manually verify a phone number.';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 4. HARDEN SERVICE REQUESTS TABLE
-- Vulnerability: Clients could change their request details (like budget) after a worker accepted it.

CREATE OR REPLACE FUNCTION public.protect_service_requests() 
RETURNS TRIGGER AS $$
BEGIN
  IF auth.role() = 'authenticated' AND OLD.status != 'open' AND (
    NEW.budget_max IS DISTINCT FROM OLD.budget_max OR
    NEW.budget_min IS DISTINCT FROM OLD.budget_min OR
    NEW.category IS DISTINCT FROM OLD.category OR
    NEW.description IS DISTINCT FROM OLD.description
  ) THEN
    RAISE EXCEPTION 'Cannot modify request details once it is no longer open.';
  END IF;
  
  IF auth.role() = 'authenticated' AND NEW.status != OLD.status THEN
    RAISE EXCEPTION 'Cannot modify request status directly.';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS tr_protect_service_requests ON public.service_requests;
CREATE TRIGGER tr_protect_service_requests
  BEFORE UPDATE ON public.service_requests
  FOR EACH ROW EXECUTE FUNCTION public.protect_service_requests();

-- 5. FINAL AUDIT CHECK
-- Revoking public/anon execution from critical RPCs (if not already done)
REVOKE ALL ON FUNCTION public.protect_worker_fields FROM PUBLIC;
REVOKE ALL ON FUNCTION public.protect_profile_roles FROM PUBLIC;
REVOKE ALL ON FUNCTION public.protect_booking_immutability FROM PUBLIC;
REVOKE ALL ON FUNCTION public.protect_service_requests FROM PUBLIC;

SELECT 'RLS Security Hardening completed successfully.' AS status;
