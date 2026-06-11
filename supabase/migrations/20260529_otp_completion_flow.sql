-- ============================================================
-- Zolvo Secure OTP-Verified Booking Completion Flow Migration
-- Run this in Supabase SQL Editor
-- ============================================================

-- Add OTP verification columns to the public.bookings table
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS otp_hash TEXT,
  ADD COLUMN IF NOT EXISTS otp_encrypted TEXT,
  ADD COLUMN IF NOT EXISTS otp_attempts INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS otp_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS otp_verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS otp_used BOOLEAN DEFAULT FALSE;

-- Index for lookups on active OTP verifications
CREATE INDEX IF NOT EXISTS idx_bookings_otp_active 
  ON public.bookings (id) 
  WHERE status = 'awaiting_otp';
