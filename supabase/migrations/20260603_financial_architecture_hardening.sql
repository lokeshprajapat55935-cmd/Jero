-- ============================================================
-- Zolvo Financial, OTP & Webhook Architecture Hardening
-- ============================================================

-- 1. Create booking_otps table
CREATE TABLE IF NOT EXISTS public.booking_otps (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  booking_id UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  otp_hash TEXT NOT NULL,
  otp_encrypted TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  attempts INTEGER DEFAULT 0,
  max_attempts INTEGER DEFAULT 5,
  used BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Create payment_attempts table
CREATE TABLE IF NOT EXISTS public.payment_attempts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  booking_id UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES public.profiles(id),
  payment_method TEXT NOT NULL CHECK (payment_method IN ('cash', 'upi', 'card')),
  amount NUMERIC NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('initiated', 'processing', 'completed', 'failed')),
  reference_id TEXT,
  error_message TEXT,
  ip_address TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Create payment_webhook_logs table
CREATE TABLE IF NOT EXISTS public.payment_webhook_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  gateway TEXT NOT NULL,
  event_id TEXT UNIQUE NOT NULL,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  processed BOOLEAN DEFAULT FALSE,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Create financial_audit_logs table
CREATE TABLE IF NOT EXISTS public.financial_audit_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  booking_id UUID REFERENCES public.bookings(id) ON DELETE SET NULL,
  actor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  amount NUMERIC,
  previous_value NUMERIC,
  new_value NUMERIC,
  notes TEXT,
  ip_address TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Enable Row Level Security (RLS)
ALTER TABLE public.booking_otps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_webhook_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_audit_logs ENABLE ROW LEVEL SECURITY;

-- 6. RLS Policies
DROP POLICY IF EXISTS "Admins can view OTP records" ON public.booking_otps;
CREATE POLICY "Admins can view OTP records" ON public.booking_otps
  FOR SELECT USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "Participants can view own OTP records" ON public.booking_otps;
CREATE POLICY "Participants can view own OTP records" ON public.booking_otps
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.bookings b
      WHERE b.id = booking_otps.booking_id AND (b.client_id = auth.uid() OR b.worker_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "Users can view own payment attempts" ON public.payment_attempts;
CREATE POLICY "Users can view own payment attempts" ON public.payment_attempts
  FOR SELECT USING (auth.uid() = client_id);

DROP POLICY IF EXISTS "Admins can view payment attempts" ON public.payment_attempts;
CREATE POLICY "Admins can view payment attempts" ON public.payment_attempts
  FOR SELECT USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "Admins can view webhook logs" ON public.payment_webhook_logs;
CREATE POLICY "Admins can view webhook logs" ON public.payment_webhook_logs
  FOR SELECT USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "Admins can view financial audit logs" ON public.financial_audit_logs;
CREATE POLICY "Admins can view financial audit logs" ON public.financial_audit_logs
  FOR SELECT USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

-- 7. Add Database Indexes
CREATE INDEX IF NOT EXISTS idx_booking_otps_booking ON public.booking_otps(booking_id);
CREATE INDEX IF NOT EXISTS idx_payment_attempts_booking ON public.payment_attempts(booking_id);
CREATE INDEX IF NOT EXISTS idx_payment_webhook_logs_event ON public.payment_webhook_logs(event_id);
CREATE INDEX IF NOT EXISTS idx_financial_audit_logs_booking ON public.financial_audit_logs(booking_id);

-- 8. Atomic OTP verification function
CREATE OR REPLACE FUNCTION public.verify_booking_otp(p_booking_id UUID, p_otp_hash TEXT, p_user_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_booking public.bookings;
  v_otp public.booking_otps;
  v_now TIMESTAMPTZ := NOW();
BEGIN
  -- Fetch and lock booking to prevent parallel race conditions
  SELECT * INTO v_booking FROM public.bookings WHERE id = p_booking_id FOR UPDATE;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking not found';
  END IF;

  -- Assert only assigned worker can verify the OTP
  IF v_booking.worker_id IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'Forbidden: Only the assigned professional can verify completion.';
  END IF;

  -- Lock OTP record
  SELECT * INTO v_otp FROM public.booking_otps 
  WHERE booking_id = p_booking_id AND used = FALSE AND expires_at > v_now
  ORDER BY created_at DESC LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Verification code has expired or is invalid. Request a new one.';
  END IF;

  -- Brute force validation
  IF v_otp.attempts >= v_otp.max_attempts THEN
    -- Mark booking as disputed
    UPDATE public.bookings 
    SET status = 'disputed', updated_at = v_now 
    WHERE id = p_booking_id;

    INSERT INTO public.booking_timeline (booking_id, status, reason, created_by)
    VALUES (p_booking_id, 'disputed', 'OTP verification blocked: too many failed attempts.', v_booking.worker_id);

    -- Log fraud flags
    INSERT INTO public.fraud_flags (user_id, flag_type, severity, status, description, booking_id, evidence)
    VALUES (
      v_booking.worker_id, 
      'wallet_abuse', 
      'high', 
      'open', 
      'Worker exceeded OTP retry attempts limit. Potential brute force attempt.', 
      p_booking_id, 
      jsonb_build_object('attempts', v_otp.attempts, 'max_attempts', v_otp.max_attempts)
    );

    RAISE EXCEPTION 'Too many verification attempts. Booking marked as disputed.';
  END IF;

  -- Match verification code
  IF v_otp.otp_hash = p_otp_hash THEN
    -- OTP Match: Mark OTP as used
    UPDATE public.booking_otps SET used = TRUE WHERE id = v_otp.id;
    
    -- Transition booking status to otp_verified, set otp_used flag on bookings
    UPDATE public.bookings 
    SET status = 'otp_verified', otp_used = TRUE, updated_at = v_now 
    WHERE id = p_booking_id;

    -- Update active_bookings table
    UPDATE public.active_bookings 
    SET status = 'otp_verified' 
    WHERE booking_id = p_booking_id;

    -- Log to timeline
    INSERT INTO public.booking_timeline (booking_id, status, reason, created_by)
    VALUES (p_booking_id, 'otp_verified', 'OTP code successfully verified. Payment interface unlocked.', v_booking.worker_id);

    RETURN jsonb_build_object('success', true);
  ELSE
    -- OTP Mismatch: increment attempts
    UPDATE public.booking_otps SET attempts = attempts + 1 WHERE id = v_otp.id;
    
    -- If it was the last attempt, trigger lockout block
    IF v_otp.attempts + 1 >= v_otp.max_attempts THEN
      UPDATE public.bookings 
      SET status = 'disputed', updated_at = v_now 
      WHERE id = p_booking_id;

      INSERT INTO public.booking_timeline (booking_id, status, reason, created_by)
      VALUES (p_booking_id, 'disputed', 'OTP verification limit reached. Booking locked.', v_booking.worker_id);

      INSERT INTO public.fraud_flags (user_id, flag_type, severity, status, description, booking_id, evidence)
      VALUES (
        v_booking.worker_id, 
        'wallet_abuse', 
        'high', 
        'open', 
        'Worker exceeded OTP retry attempts limit. Potential brute force attempt.', 
        p_booking_id, 
        jsonb_build_object('attempts', v_otp.attempts + 1, 'max_attempts', v_otp.max_attempts)
      );

      RAISE EXCEPTION 'Invalid OTP. Attempt limit exceeded. Booking marked as disputed.';
    END IF;

    RAISE EXCEPTION 'Invalid OTP verification code. Attempts remaining: %', (v_otp.max_attempts - (v_otp.attempts + 1));
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
