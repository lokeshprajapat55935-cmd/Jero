-- Migration to create isolated admin credentials storage
-- This ensures that admin passwords are not stored in frontend accessible tables.

-- Create admin_secrets table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.admin_secrets (
    admin_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
    password_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Protect table with strict RLS
ALTER TABLE public.admin_secrets ENABLE ROW LEVEL SECURITY;

-- The admin_secrets table should ONLY be accessible via the service_role key (server-side)
-- Therefore, we do NOT create any SELECT policies for authenticated or anon users.
-- This ensures the frontend can NEVER read a password hash.

-- Optional trigger to auto-update updated_at
CREATE OR REPLACE FUNCTION update_admin_secrets_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_admin_secrets_updated_at ON public.admin_secrets;
CREATE TRIGGER trg_admin_secrets_updated_at
BEFORE UPDATE ON public.admin_secrets
FOR EACH ROW EXECUTE FUNCTION update_admin_secrets_updated_at();
