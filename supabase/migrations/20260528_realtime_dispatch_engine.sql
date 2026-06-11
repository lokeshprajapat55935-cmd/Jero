-- Realtime Dispatch and Location Engine Migration
-- Sets up tables, triggers, and RPC functions in Supabase.

-- 1. Create worker_availability table
CREATE TABLE IF NOT EXISTS public.worker_availability (
  worker_id UUID PRIMARY KEY REFERENCES public.workers(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'offline' CHECK (status IN ('offline', 'online', 'busy', 'available')),
  last_active_at TIMESTAMPTZ DEFAULT NOW(),
  current_booking_id UUID REFERENCES public.bookings(id) ON DELETE SET NULL
);

-- Index on availability status
CREATE INDEX IF NOT EXISTS idx_worker_availability_status ON public.worker_availability(status);

-- 2. Create trigger to sync legacy workers.availability column with new worker_availability table
CREATE OR REPLACE FUNCTION public.sync_workers_json_availability()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.workers
  SET availability = jsonb_build_object(
    'status', NEW.status,
    'last_active_at', NEW.last_active_at,
    'current_booking_id', NEW.current_booking_id
  )
  WHERE id = NEW.worker_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER trigger_sync_workers_json_availability
  AFTER INSERT OR UPDATE ON public.worker_availability
  FOR EACH ROW EXECUTE FUNCTION public.sync_workers_json_availability();

-- 3. Create dispatch_requests table
CREATE TABLE IF NOT EXISTS public.dispatch_requests (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  booking_id UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'searching' CHECK (status IN ('searching', 'accepted', 'expired', 'cancelled')),
  max_radius_km NUMERIC NOT NULL DEFAULT 15.0,
  current_radius_km NUMERIC NOT NULL DEFAULT 5.0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dispatch_requests_booking ON public.dispatch_requests(booking_id);
CREATE INDEX IF NOT EXISTS idx_dispatch_requests_status ON public.dispatch_requests(status);

-- 4. Create dispatch_attempts table
CREATE TABLE IF NOT EXISTS public.dispatch_attempts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  dispatch_request_id UUID NOT NULL REFERENCES public.dispatch_requests(id) ON DELETE CASCADE,
  worker_id UUID NOT NULL REFERENCES public.workers(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'accepted', 'rejected', 'expired')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (dispatch_request_id, worker_id)
);

CREATE INDEX IF NOT EXISTS idx_dispatch_attempts_request_worker ON public.dispatch_attempts(dispatch_request_id, worker_id);

-- 5. Create active_bookings table for strict single-assignment locking
CREATE TABLE IF NOT EXISTS public.active_bookings (
  booking_id UUID PRIMARY KEY REFERENCES public.bookings(id) ON DELETE CASCADE,
  worker_id UUID NOT NULL REFERENCES public.workers(id) ON DELETE CASCADE UNIQUE,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. Enable RLS on new tables
ALTER TABLE public.worker_availability ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dispatch_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dispatch_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.active_bookings ENABLE ROW LEVEL SECURITY;

-- 7. RLS Policies
DROP POLICY IF EXISTS "Availability viewable by everyone" ON public.worker_availability;
CREATE POLICY "Availability viewable by everyone" ON public.worker_availability
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Workers can update own availability" ON public.worker_availability;
CREATE POLICY "Workers can update own availability" ON public.worker_availability
  FOR ALL USING (auth.uid() = worker_id);

DROP POLICY IF EXISTS "Dispatch requests viewable by participants" ON public.dispatch_requests;
CREATE POLICY "Dispatch requests viewable by participants" ON public.dispatch_requests
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.bookings b
      WHERE b.id = booking_id
      AND (b.client_id = auth.uid() OR b.worker_id = auth.uid() OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'))
    )
  );

DROP POLICY IF EXISTS "Admins can update dispatch requests" ON public.dispatch_requests;
CREATE POLICY "Admins can update dispatch requests" ON public.dispatch_requests
  FOR ALL USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "Dispatch attempts viewable by worker or admin" ON public.dispatch_attempts;
CREATE POLICY "Dispatch attempts viewable by worker or admin" ON public.dispatch_attempts
  FOR SELECT USING (
    auth.uid() = worker_id OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

DROP POLICY IF EXISTS "Active bookings viewable by everyone" ON public.active_bookings;
CREATE POLICY "Active bookings viewable by everyone" ON public.active_bookings
  FOR SELECT USING (true);

-- 8. Haversine distance calculator function to find nearby workers
CREATE OR REPLACE FUNCTION public.get_nearby_dispatch_workers(
  p_latitude NUMERIC,
  p_longitude NUMERIC,
  p_category TEXT,
  p_radius_km NUMERIC,
  p_limit INTEGER
)
RETURNS TABLE (
  worker_id UUID,
  distance_km NUMERIC,
  rating_avg NUMERIC,
  review_count INTEGER,
  latitude NUMERIC,
  longitude NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    w.id AS worker_id,
    (6371 * acos(
      cos(radians(p_latitude)) * cos(radians(wl.latitude)) * 
      cos(radians(wl.longitude) - radians(p_longitude)) + 
      sin(radians(p_latitude)) * sin(radians(wl.latitude))
    ))::numeric AS distance_km,
    w.rating_avg,
    w.review_count,
    wl.latitude,
    wl.longitude
  FROM public.workers w
  JOIN public.worker_locations wl ON wl.worker_id = w.id
  JOIN public.worker_availability wa ON wa.worker_id = w.id
  WHERE w.status = 'active'
    AND w.category = p_category
    AND wa.status = 'available'
    AND wl.latitude IS NOT NULL
    AND wl.longitude IS NOT NULL
    AND (6371 * acos(
      cos(radians(p_latitude)) * cos(radians(wl.latitude)) * 
      cos(radians(wl.longitude) - radians(p_longitude)) + 
      sin(radians(p_latitude)) * sin(radians(wl.latitude))
    )) <= p_radius_km
  ORDER BY 
    distance_km ASC,
    w.rating_avg DESC,
    w.review_count DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 9. Atomic booking accept function
CREATE OR REPLACE FUNCTION public.accept_dispatch_booking(p_booking_id UUID, p_worker_id UUID)
RETURNS public.bookings AS $$
DECLARE
  v_booking public.bookings;
  v_now TIMESTAMPTZ := NOW();
BEGIN
  -- 1. Check if worker is active & approved
  IF NOT EXISTS (
    SELECT 1 FROM public.workers 
    WHERE id = p_worker_id AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'Only active professionals can accept bookings';
  END IF;

  -- 2. Check if worker already has an active booking (Active Booking Lock)
  IF EXISTS (
    SELECT 1 FROM public.active_bookings 
    WHERE worker_id = p_worker_id
  ) THEN
    RAISE EXCEPTION 'You already have an active booking';
  END IF;

  -- 3. Lock the booking and update it if it's broadcasting and worker_id is null
  UPDATE public.bookings
  SET worker_id = p_worker_id,
      status = 'accepted',
      updated_at = v_now
  WHERE id = p_booking_id
    AND worker_id IS NULL
    AND status = 'broadcasting'
    AND expires_at > v_now
  RETURNING * INTO v_booking;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking is no longer available or has been accepted by someone else';
  END IF;

  -- 4. Insert into active_bookings (atomically locking the worker from other dispatches)
  INSERT INTO public.active_bookings (booking_id, worker_id, client_id, status)
  VALUES (v_booking.id, p_worker_id, v_booking.client_id, 'accepted');

  -- 5. Update worker availability status to busy
  INSERT INTO public.worker_availability (worker_id, status, last_active_at, current_booking_id)
  VALUES (p_worker_id, 'busy', v_now, v_booking.id)
  ON CONFLICT (worker_id) 
  DO UPDATE SET status = 'busy', last_active_at = v_now, current_booking_id = v_booking.id;

  -- 6. Update dispatch request to accepted
  UPDATE public.dispatch_requests
  SET status = 'accepted', updated_at = v_now
  WHERE booking_id = p_booking_id;

  RETURN v_booking;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 10. Sync booking updates to release worker locks on completion or cancellation
CREATE OR REPLACE FUNCTION public.sync_booking_completion_and_release()
RETURNS TRIGGER AS $$
BEGIN
  -- If status transitioned to completed, paid_completed, cancelled, or disputed
  IF NEW.status IN ('completed', 'paid_completed', 'cancelled', 'disputed') THEN
    -- Delete from active bookings
    DELETE FROM public.active_bookings WHERE booking_id = NEW.id;

    -- Update worker availability to online (available)
    IF NEW.worker_id IS NOT NULL THEN
      UPDATE public.worker_availability
      SET status = 'available', current_booking_id = NULL, last_active_at = NOW()
      WHERE worker_id = NEW.worker_id;
    END IF;
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    -- Sync active booking status
    UPDATE public.active_bookings
    SET status = NEW.status
    WHERE booking_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Safe trigger drop & creation
DROP TRIGGER IF EXISTS trigger_sync_booking_completion_and_release ON public.bookings;
CREATE TRIGGER trigger_sync_booking_completion_and_release
  AFTER UPDATE OF status ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.sync_booking_completion_and_release();
