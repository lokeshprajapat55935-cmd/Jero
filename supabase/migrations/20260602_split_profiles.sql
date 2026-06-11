-- 1. Create Partner Status Enum if it doesn't exist
DO $$ BEGIN
    CREATE TYPE partner_status AS ENUM ('pending', 'under_review', 'approved', 'rejected', 'suspended');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 2. Create Customers Table
CREATE TABLE IF NOT EXISTS public.customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    full_name TEXT,
    city TEXT,
    address TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(profile_id)
);

-- 3. Create Partners Table
CREATE TABLE IF NOT EXISTS public.partners (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    full_name TEXT,
    gender TEXT,
    dob DATE,
    service_category TEXT,
    experience TEXT,
    skills TEXT[],
    working_areas TEXT[],
    languages TEXT[],
    aadhaar_number TEXT,
    pan_number TEXT,
    selfie_url TEXT,
    aadhaar_front_url TEXT,
    aadhaar_back_url TEXT,
    bank_holder_name TEXT,
    bank_account_number TEXT,
    ifsc_code TEXT,
    upi_id TEXT,
    working_days TEXT[],
    working_hours TEXT,
    service_radius TEXT,
    status partner_status DEFAULT 'pending',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(profile_id)
);

-- 4. Enable RLS
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partners ENABLE ROW LEVEL SECURITY;

-- 5. Safe Development Policies
-- Since Firebase is handling auth, Supabase doesn't natively have the JWT context unless bridged.
-- For now, we allow public operations, and server-side Edge Functions/API routes will handle the strict validation.
CREATE POLICY "Allow dev operations on customers" ON public.customers FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow dev operations on partners" ON public.partners FOR ALL USING (true) WITH CHECK (true);
