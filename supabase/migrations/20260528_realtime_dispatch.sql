-- Realtime Dispatch Booking System Migration
-- Run this in your Supabase SQL Editor to prepare/update the database.

-- 1. Make worker_id nullable in bookings (needed before acceptance)
ALTER TABLE public.bookings ALTER COLUMN worker_id DROP NOT NULL;

-- 2. Add columns for dispatch, geo location, and OTP verification
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS location_address TEXT,
  ADD COLUMN IF NOT EXISTS latitude NUMERIC,
  ADD COLUMN IF NOT EXISTS longitude NUMERIC,
  ADD COLUMN IF NOT EXISTS area_id UUID REFERENCES public.areas(id),
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS notified_worker_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS otp_code TEXT;

-- 3. Modify booking immutability trigger to allow setting worker_id when it was NULL
CREATE OR REPLACE FUNCTION public.protect_booking_immutability()
RETURNS TRIGGER AS $$
BEGIN
  IF auth.role() = 'authenticated' AND (
    NEW.client_id IS DISTINCT FROM OLD.client_id OR
    (OLD.worker_id IS NOT NULL AND NEW.worker_id IS DISTINCT FROM OLD.worker_id) OR
    NEW.total_price IS DISTINCT FROM OLD.total_price OR
    NEW.emergency_request_id IS DISTINCT FROM OLD.emergency_request_id
  ) THEN
    RAISE EXCEPTION 'Cannot modify client_id, worker_id, total_price, or emergency_request_id of a booking.';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Re-configure RLS Policies for public.bookings to allow dispatch workflow

-- Drop old restricted policies
DROP POLICY IF EXISTS "Workers can view their assigned bookings" ON public.bookings;
DROP POLICY IF EXISTS "Participants can update booking status" ON public.bookings;

-- Create worker select policy: Workers can see assigned bookings OR broadcasting requests matching their category
CREATE POLICY "Workers can view assigned or broadcasting bookings" ON public.bookings
  FOR SELECT USING (
    auth.uid() = worker_id OR
    (
      EXISTS (
        SELECT 1 FROM public.workers w
        WHERE w.id = auth.uid()
        AND w.category = bookings.category
        AND w.status = 'active'
      )
      AND status = 'broadcasting'
    )
  );

-- Create update policy: Participants can update, and eligible workers can update to accept
CREATE POLICY "Participants and eligible workers can update bookings" ON public.bookings
  FOR UPDATE USING (
    auth.uid() = client_id OR
    auth.uid() = worker_id OR
    (
      EXISTS (
        SELECT 1 FROM public.workers w
        WHERE w.id = auth.uid()
        AND w.category = bookings.category
        AND w.status = 'active'
      )
      AND worker_id IS NULL
      AND status = 'broadcasting'
    )
  );

-- 5. Enable Supabase Realtime for standard bookings table updates
-- We wrap this in a safe block in case it's already in the publication
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
    AND schemaname = 'public' 
    AND tablename = 'bookings'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.bookings;
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    -- If publication doesn't exist yet, do nothing
    NULL;
END $$;
