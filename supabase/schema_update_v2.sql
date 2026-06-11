/**
 * Supabase Database Schema - Client System Expansion
 */

-- Create saved_workers table
CREATE TABLE IF NOT EXISTS public.saved_workers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE NOT NULL,
  worker_id UUID REFERENCES public.workers(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(client_id, worker_id)
);

ALTER TABLE public.saved_workers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Clients can view their saved workers." ON public.saved_workers
  FOR SELECT USING (auth.uid() = client_id);

CREATE POLICY "Clients can save workers." ON public.saved_workers
  FOR INSERT WITH CHECK (auth.uid() = client_id);

CREATE POLICY "Clients can remove saved workers." ON public.saved_workers
  FOR DELETE USING (auth.uid() = client_id);

-- Create service_requests table
CREATE TABLE IF NOT EXISTS public.service_requests (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL,
  budget_min NUMERIC,
  budget_max NUMERIC,
  location_address TEXT,
  status TEXT DEFAULT 'open', -- open, in-progress, completed, cancelled
  scheduled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.service_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Clients can view their own requests." ON public.service_requests
  FOR SELECT USING (auth.uid() = client_id);

CREATE POLICY "Clients can create requests." ON public.service_requests
  FOR INSERT WITH CHECK (auth.uid() = client_id);

CREATE POLICY "Clients can update their requests." ON public.service_requests
  FOR UPDATE USING (auth.uid() = client_id);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_saved_workers_client ON public.saved_workers(client_id);
CREATE INDEX IF NOT EXISTS idx_service_requests_client ON public.service_requests(client_id);
CREATE INDEX IF NOT EXISTS idx_service_requests_status ON public.service_requests(status);
