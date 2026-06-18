-- 1. Add kyc_status to customers
DO $$ BEGIN
    ALTER TABLE public.customers ADD COLUMN kyc_status TEXT DEFAULT 'unverified';
EXCEPTION
    WHEN duplicate_column THEN null;
END $$;

-- 2. Create customer_verifications table
CREATE TABLE IF NOT EXISTS public.customer_verifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    full_name TEXT NOT NULL,
    dob DATE NOT NULL,
    gender TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    verification_notes TEXT,
    verified_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(profile_id)
);

-- 3. Enable RLS on customer_verifications
ALTER TABLE public.customer_verifications ENABLE ROW LEVEL SECURITY;

-- Allow users to view their own verifications
DROP POLICY IF EXISTS "Users can view own verifications" ON public.customer_verifications;
CREATE POLICY "Users can view own verifications" ON public.customer_verifications
    FOR SELECT USING (auth.uid() = profile_id);

-- Allow users to insert their own verifications
DROP POLICY IF EXISTS "Users can insert own verifications" ON public.customer_verifications;
CREATE POLICY "Users can insert own verifications" ON public.customer_verifications
    FOR INSERT WITH CHECK (auth.uid() = profile_id);

-- Allow admin full access
DROP POLICY IF EXISTS "Admins have full access to customer verifications" ON public.customer_verifications;
CREATE POLICY "Admins have full access to customer verifications" ON public.customer_verifications
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
        )
    );

-- Allow server-side service role full bypass via a restricted internal policy
DROP POLICY IF EXISTS "Allow service_role full access" ON public.customer_verifications;
CREATE POLICY "Allow service_role full access" ON public.customer_verifications
    FOR ALL USING (auth.role() = 'service_role');

