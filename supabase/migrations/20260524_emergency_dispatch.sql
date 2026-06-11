-- Emergency dispatch foundation: one-tap request, worker broadcast, first-accept-wins.

CREATE TABLE IF NOT EXISTS public.emergency_requests (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE NOT NULL,
  category TEXT NOT NULL,
  location_address TEXT,
  latitude NUMERIC,
  longitude NUMERIC,
  city_id UUID REFERENCES public.cities(id),
  area_id UUID REFERENCES public.areas(id),
  status TEXT DEFAULT 'dispatching' NOT NULL,
  accepted_worker_id UUID REFERENCES public.workers(id),
  accepted_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '60 seconds'),
  notified_worker_count INTEGER DEFAULT 0,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.emergency_acceptances (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  emergency_request_id UUID REFERENCES public.emergency_requests(id) ON DELETE CASCADE NOT NULL,
  worker_id UUID REFERENCES public.workers(id) ON DELETE CASCADE NOT NULL,
  accepted BOOLEAN DEFAULT FALSE,
  result TEXT DEFAULT 'pending' NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(emergency_request_id, worker_id)
);

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS emergency_request_id UUID REFERENCES public.emergency_requests(id) ON DELETE SET NULL;

ALTER TABLE public.emergency_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.emergency_acceptances ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Clients can create emergency requests" ON public.emergency_requests;
CREATE POLICY "Clients can create emergency requests"
  ON public.emergency_requests
  FOR INSERT
  WITH CHECK (auth.uid() = client_id);

DROP POLICY IF EXISTS "Emergency participants can view requests" ON public.emergency_requests;
CREATE POLICY "Emergency participants can view requests"
  ON public.emergency_requests
  FOR SELECT
  USING (auth.uid() = client_id OR auth.uid() = accepted_worker_id);

DROP POLICY IF EXISTS "Workers can view own emergency acceptances" ON public.emergency_acceptances;
CREATE POLICY "Workers can view own emergency acceptances"
  ON public.emergency_acceptances
  FOR SELECT
  USING (auth.uid() = worker_id);

DROP POLICY IF EXISTS "Workers can insert own emergency acceptances" ON public.emergency_acceptances;
CREATE POLICY "Workers can insert own emergency acceptances"
  ON public.emergency_acceptances
  FOR INSERT
  WITH CHECK (auth.uid() = worker_id);

CREATE INDEX IF NOT EXISTS idx_emergency_requests_client_created
  ON public.emergency_requests(client_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_emergency_requests_dispatch
  ON public.emergency_requests(category, city_id, area_id, status, expires_at);

CREATE INDEX IF NOT EXISTS idx_emergency_acceptances_request
  ON public.emergency_acceptances(emergency_request_id, created_at);

CREATE INDEX IF NOT EXISTS idx_bookings_emergency_request
  ON public.bookings(emergency_request_id);

CREATE INDEX IF NOT EXISTS idx_notifications_emergency
  ON public.notifications((metadata->>'emergency_request_id'))
  WHERE type = 'emergency_request';
