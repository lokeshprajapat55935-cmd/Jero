-- Optimize geographical queries for emergency dispatch
CREATE INDEX IF NOT EXISTS idx_workers_geo_dispatch ON public.workers(category, status, city_id, area_id);
CREATE INDEX IF NOT EXISTS idx_emergency_requests_status_expires ON public.emergency_requests(status, expires_at);
CREATE INDEX IF NOT EXISTS idx_emergency_requests_client ON public.emergency_requests(client_id, status);
