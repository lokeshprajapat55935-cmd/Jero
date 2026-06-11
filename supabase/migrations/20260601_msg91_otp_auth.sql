-- Create otp_requests table for secure OTP handling
CREATE TABLE IF NOT EXISTS public.otp_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mobile TEXT NOT NULL UNIQUE,
  otp_hash TEXT NOT NULL,
  attempts INTEGER DEFAULT 0,
  locked_until TIMESTAMP WITH TIME ZONE,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_request_time TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  request_count INTEGER DEFAULT 1
);

-- Create auth_audit_logs for security tracking
CREATE TABLE IF NOT EXISTS public.auth_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL,
  mobile TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- RLS Configuration
-- These tables are strictly for server-side use only.
ALTER TABLE public.otp_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auth_audit_logs ENABLE ROW LEVEL SECURITY;

-- Deny all client access (no policies means default deny)
-- The server will use the Admin/Service Role client to bypass RLS for these tables.

-- Create indexes for performance and cleanup
CREATE INDEX IF NOT EXISTS idx_otp_requests_mobile ON public.otp_requests(mobile);
CREATE INDEX IF NOT EXISTS idx_otp_requests_expires_at ON public.otp_requests(expires_at);
CREATE INDEX IF NOT EXISTS idx_auth_audit_logs_event_type ON public.auth_audit_logs(event_type);
CREATE INDEX IF NOT EXISTS idx_auth_audit_logs_created_at ON public.auth_audit_logs(created_at DESC);
