-- Mobile-number-first authentication hardening.
-- Supabase Auth owns OTP generation, expiry, session issuance, and SMS delivery.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS phone TEXT,
  ADD COLUMN IF NOT EXISTS phone_verified BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;

ALTER TABLE public.profiles
  ALTER COLUMN email DROP NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_phone_unique_idx
  ON public.profiles (phone)
  WHERE phone IS NOT NULL;

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

ALTER TABLE public.auth_audit_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own auth audit events" ON public.auth_audit_events;
CREATE POLICY "Users can view own auth audit events"
  ON public.auth_audit_events
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS auth_audit_events_user_created_idx
  ON public.auth_audit_events (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS auth_audit_events_phone_created_idx
  ON public.auth_audit_events (phone, created_at DESC);

DROP POLICY IF EXISTS "Workers can insert own data." ON public.workers;
CREATE POLICY "Workers can insert own data."
  ON public.workers
  FOR INSERT
  WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Clients can insert own data." ON public.clients;
CREATE POLICY "Clients can insert own data."
  ON public.clients
  FOR INSERT
  WITH CHECK (auth.uid() = id);

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, avatar_url, phone, phone_verified)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'avatar_url',
    COALESCE(NEW.phone, NEW.raw_user_meta_data->>'phone'),
    COALESCE(NEW.phone_confirmed_at IS NOT NULL, FALSE)
  )
  ON CONFLICT (id) DO UPDATE SET
    phone = COALESCE(EXCLUDED.phone, public.profiles.phone),
    phone_verified = public.profiles.phone_verified OR EXCLUDED.phone_verified,
    updated_at = NOW();

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
