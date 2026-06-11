/**
 * Supabase Database Schema - Phase 3 Part 3: Booking Engine
 */

-- Create Bookings table
CREATE TABLE IF NOT EXISTS public.bookings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  request_id UUID REFERENCES public.service_requests(id) ON DELETE SET NULL,
  client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE NOT NULL,
  worker_id UUID REFERENCES public.workers(id) ON DELETE CASCADE NOT NULL,
  status TEXT DEFAULT 'pending', -- pending, confirmed, scheduled, in-progress, completed, cancelled, disputed
  total_price NUMERIC NOT NULL,
  scheduled_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS for bookings
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Clients can view their own bookings" ON public.bookings
  FOR SELECT USING (auth.uid() = client_id);

CREATE POLICY "Workers can view their assigned bookings" ON public.bookings
  FOR SELECT USING (auth.uid() = worker_id);

CREATE POLICY "Clients can create bookings" ON public.bookings
  FOR INSERT WITH CHECK (auth.uid() = client_id);

CREATE POLICY "Participants can update booking status" ON public.bookings
  FOR UPDATE USING (auth.uid() = client_id OR auth.uid() = worker_id);

-- Create Booking Timeline table for tracking status transitions
CREATE TABLE IF NOT EXISTS public.booking_timeline (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  booking_id UUID REFERENCES public.bookings(id) ON DELETE CASCADE NOT NULL,
  status TEXT NOT NULL,
  reason TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.booking_timeline ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Participants can view booking timeline" ON public.booking_timeline
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.bookings b 
      WHERE b.id = booking_id 
      AND (b.client_id = auth.uid() OR b.worker_id = auth.uid())
    )
  );

-- Indexes
CREATE INDEX IF NOT EXISTS idx_bookings_client ON public.bookings(client_id);
CREATE INDEX IF NOT EXISTS idx_bookings_worker ON public.bookings(worker_id);
CREATE INDEX IF NOT EXISTS idx_bookings_status ON public.bookings(status);
CREATE INDEX IF NOT EXISTS idx_booking_timeline_booking ON public.booking_timeline(booking_id);
