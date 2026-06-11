-- ============================================================
-- Zolvo Booking, Billing, OTP, and Payment Refactor Migration
-- ============================================================

-- 1. Create booking_items table
CREATE TABLE IF NOT EXISTS public.booking_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  booking_id UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_price NUMERIC NOT NULL CHECK (unit_price >= 0),
  total_price NUMERIC NOT NULL CHECK (total_price >= 0),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Create booking_item_approvals table
CREATE TABLE IF NOT EXISTS public.booking_item_approvals (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  booking_id UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  approved BOOLEAN NOT NULL DEFAULT FALSE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Create booking_payments table
CREATE TABLE IF NOT EXISTS public.booking_payments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  booking_id UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  worker_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  payment_method TEXT NOT NULL CHECK (payment_method IN ('cash', 'upi', 'card')),
  amount NUMERIC NOT NULL CHECK (amount >= 0),
  status TEXT NOT NULL CHECK (status IN ('initiated', 'processing', 'completed', 'failed')),
  reference_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Enable Row Level Security (RLS)
ALTER TABLE public.booking_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booking_item_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booking_payments ENABLE ROW LEVEL SECURITY;

-- 5. RLS Policies
DROP POLICY IF EXISTS "Participants can view booking items" ON public.booking_items;
CREATE POLICY "Participants can view booking items" ON public.booking_items
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.bookings b
      WHERE b.id = booking_id AND (b.client_id = auth.uid() OR b.worker_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "Workers can modify booking items in active states" ON public.booking_items;
CREATE POLICY "Workers can modify booking items in active states" ON public.booking_items
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.bookings b
      WHERE b.id = booking_id AND b.worker_id = auth.uid() AND b.status IN ('work_completed', 'awaiting_item_approval')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.bookings b
      WHERE b.id = booking_id AND b.worker_id = auth.uid() AND b.status IN ('work_completed', 'awaiting_item_approval')
    )
  );

DROP POLICY IF EXISTS "Participants can view booking item approvals" ON public.booking_item_approvals;
CREATE POLICY "Participants can view booking item approvals" ON public.booking_item_approvals
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.bookings b
      WHERE b.id = booking_id AND (b.client_id = auth.uid() OR b.worker_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "Clients can approve booking items" ON public.booking_item_approvals;
CREATE POLICY "Clients can approve booking items" ON public.booking_item_approvals
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.bookings b
      WHERE b.id = booking_id AND b.client_id = auth.uid() AND b.status = 'awaiting_item_approval'
    ) AND auth.uid() = client_id
  );

DROP POLICY IF EXISTS "Participants can view booking payments" ON public.booking_payments;
CREATE POLICY "Participants can view booking payments" ON public.booking_payments
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.bookings b
      WHERE b.id = booking_id AND (b.client_id = auth.uid() OR b.worker_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "Clients can initiate booking payments" ON public.booking_payments;
CREATE POLICY "Clients can initiate booking payments" ON public.booking_payments
  FOR ALL USING (auth.uid() = client_id) WITH CHECK (auth.uid() = client_id);

-- 6. Indexes
CREATE INDEX IF NOT EXISTS idx_booking_items_booking ON public.booking_items(booking_id);
CREATE INDEX IF NOT EXISTS idx_booking_item_approvals_booking ON public.booking_item_approvals(booking_id);
CREATE INDEX IF NOT EXISTS idx_booking_payments_booking ON public.booking_payments(booking_id);

-- 7. Trigger: Immutability check for booking items once approved/locked
CREATE OR REPLACE FUNCTION public.check_booking_items_immutable()
RETURNS TRIGGER AS $$
DECLARE
  v_status TEXT;
BEGIN
  SELECT status INTO v_status FROM public.bookings WHERE id = COALESCE(NEW.booking_id, OLD.booking_id);
  IF v_status IN ('item_approved', 'otp_generated', 'otp_verified', 'awaiting_payment', 'payment_processing', 'payment_verified', 'completed', 'cancelled', 'disputed') THEN
    RAISE EXCEPTION 'Booking items are locked and immutable after approval (status: %).', v_status;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_check_booking_items_immutable ON public.booking_items;
CREATE TRIGGER trigger_check_booking_items_immutable
  BEFORE INSERT OR UPDATE OR DELETE ON public.booking_items
  FOR EACH ROW EXECUTE FUNCTION public.check_booking_items_immutable();

-- 8. Trigger: Sync booking total price automatically on billing changes
CREATE OR REPLACE FUNCTION public.sync_booking_total_price()
RETURNS TRIGGER AS $$
DECLARE
  v_discount_rate NUMERIC := 0.05;
BEGIN
  -- Online payments (upi, card) receive a 5% discount on the working (service) charge
  IF NEW.payment_method IN ('upi', 'card') THEN
    NEW.discount_amount := ROUND(NEW.service_charge * v_discount_rate, 0);
  ELSE
    NEW.discount_amount := 0;
  END IF;

  NEW.total_price := COALESCE(NEW.service_charge, 0) + COALESCE(NEW.visit_charge, 0) + COALESCE(NEW.material_charge, 0) - COALESCE(NEW.discount_amount, 0);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_sync_booking_total_price ON public.bookings;
CREATE TRIGGER trigger_sync_booking_total_price
  BEFORE INSERT OR UPDATE OF service_charge, visit_charge, material_charge, payment_method ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.sync_booking_total_price();

-- 9. Update accept_dispatch_booking RPC to automatically calculate visit charge
CREATE OR REPLACE FUNCTION public.accept_dispatch_booking(p_booking_id UUID, p_worker_id UUID)
RETURNS public.bookings AS $$
DECLARE
  v_booking public.bookings;
  v_now TIMESTAMPTZ := NOW();
  v_worker_lat NUMERIC;
  v_worker_lng NUMERIC;
  v_distance_m NUMERIC;
  v_visit_charge NUMERIC := 0;
BEGIN
  -- 1. Check if worker is active & approved
  IF NOT EXISTS (
    SELECT 1 FROM public.workers 
    WHERE id = p_worker_id AND status = 'approved'
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

  -- 3. Fetch booking coords to calculate distance
  SELECT latitude, longitude INTO v_worker_lat, v_worker_lng
  FROM public.worker_locations
  WHERE worker_id = p_worker_id;

  -- First select booking to get client latitude/longitude
  SELECT * INTO v_booking FROM public.bookings WHERE id = p_booking_id;
  
  IF v_worker_lat IS NOT NULL AND v_worker_lng IS NOT NULL AND v_booking.latitude IS NOT NULL AND v_booking.longitude IS NOT NULL THEN
    v_distance_m := calculate_distance_m(v_worker_lat, v_worker_lng, v_booking.latitude, v_booking.longitude);
    -- ₹5 per km (v_distance_m / 1000.0)
    v_visit_charge := ROUND((v_distance_m / 1000.0) * 5.0, 2);
  END IF;

  -- 4. Lock and update booking status to accepted with the computed visit charge
  UPDATE public.bookings
  SET worker_id = p_worker_id,
      status = 'accepted',
      visit_charge = v_visit_charge,
      updated_at = v_now
  WHERE id = p_booking_id
    AND worker_id IS NULL
    AND status = 'broadcasting'
    AND expires_at > v_now
  RETURNING * INTO v_booking;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking is no longer available or has been accepted by someone else';
  END IF;

  -- 5. Insert into active_bookings
  INSERT INTO public.active_bookings (booking_id, worker_id, client_id, status)
  VALUES (v_booking.id, p_worker_id, v_booking.client_id, 'accepted');

  -- 6. Update worker availability status to busy
  INSERT INTO public.worker_availability (worker_id, status, last_active_at, current_booking_id)
  VALUES (p_worker_id, 'busy', v_now, v_booking.id)
  ON CONFLICT (worker_id) 
  DO UPDATE SET status = 'busy', last_active_at = v_now, current_booking_id = v_booking.id;

  -- 7. Update dispatch request to accepted
  UPDATE public.dispatch_requests
  SET status = 'accepted', updated_at = v_now
  WHERE booking_id = p_booking_id;

  RETURN v_booking;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 10. Update validate_booking_state_transition trigger function for 14-state flow
CREATE OR REPLACE FUNCTION public.validate_booking_state_transition()
RETURNS TRIGGER AS $$
DECLARE
  v_worker_lat NUMERIC;
  v_worker_lng NUMERIC;
  v_distance_m NUMERIC;
  v_cancel_count INTEGER;
  v_cancellation_threshold INTEGER;
BEGIN
  -- Strict 14-state path + cancelled + disputed
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF OLD.status = 'pending' AND NEW.status NOT IN ('broadcasting', 'cancelled') THEN
      RAISE EXCEPTION 'Invalid transition from pending to %', NEW.status;
    ELSIF OLD.status = 'broadcasting' AND NEW.status NOT IN ('accepted', 'cancelled') THEN
      RAISE EXCEPTION 'Invalid transition from broadcasting to %', NEW.status;
    ELSIF OLD.status = 'accepted' AND NEW.status NOT IN ('worker_arriving', 'cancelled') THEN
      RAISE EXCEPTION 'Invalid transition from accepted to %', NEW.status;
    ELSIF OLD.status = 'worker_arriving' AND NEW.status NOT IN ('work_started', 'cancelled') THEN
      RAISE EXCEPTION 'Invalid transition from worker_arriving to %', NEW.status;
    ELSIF OLD.status = 'work_started' AND NEW.status NOT IN ('work_completed', 'cancelled') THEN
      RAISE EXCEPTION 'Invalid transition from work_started to %', NEW.status;
    ELSIF OLD.status = 'work_completed' AND NEW.status NOT IN ('awaiting_item_approval') THEN
      RAISE EXCEPTION 'Invalid transition from work_completed to %', NEW.status;
    ELSIF OLD.status = 'awaiting_item_approval' AND NEW.status NOT IN ('item_approved') THEN
      RAISE EXCEPTION 'Invalid transition from awaiting_item_approval to %', NEW.status;
    ELSIF OLD.status = 'item_approved' AND NEW.status NOT IN ('otp_generated') THEN
      RAISE EXCEPTION 'Invalid transition from item_approved to %', NEW.status;
    ELSIF OLD.status = 'otp_generated' AND NEW.status NOT IN ('otp_verified', 'disputed') THEN
      RAISE EXCEPTION 'Invalid transition from otp_generated to %', NEW.status;
    ELSIF OLD.status = 'otp_verified' AND NEW.status NOT IN ('awaiting_payment') THEN
      RAISE EXCEPTION 'Invalid transition from otp_verified to %', NEW.status;
    ELSIF OLD.status = 'awaiting_payment' AND NEW.status NOT IN ('payment_processing', 'disputed') THEN
      RAISE EXCEPTION 'Invalid transition from awaiting_payment to % (OTP is verified, payment required)', NEW.status;
    ELSIF OLD.status = 'payment_processing' AND NEW.status NOT IN ('payment_verified', 'disputed') THEN
      RAISE EXCEPTION 'Invalid transition from payment_processing to %', NEW.status;
    ELSIF OLD.status = 'payment_verified' AND NEW.status NOT IN ('completed') THEN
      RAISE EXCEPTION 'Invalid transition from payment_verified to %', NEW.status;
    ELSIF OLD.status = 'completed' THEN
      RAISE EXCEPTION 'Booking is already completed';
    ELSIF OLD.status = 'cancelled' THEN
      RAISE EXCEPTION 'Cannot modify state of a cancelled booking';
    ELSIF OLD.status = 'disputed' AND NEW.status NOT IN ('completed', 'cancelled') THEN
      RAISE EXCEPTION 'Invalid transition from disputed to %', NEW.status;
    END IF;
  END IF;

  -- GPS Fraud Check: verify worker is close to client on work_started and work_completed status updates
  IF NEW.status IN ('work_started', 'work_completed') AND NEW.worker_id IS NOT NULL AND (OLD.status IS DISTINCT FROM NEW.status) THEN
    SELECT latitude, longitude INTO v_worker_lat, v_worker_lng
    FROM public.worker_locations
    WHERE worker_id = NEW.worker_id;

    IF v_worker_lat IS NOT NULL AND v_worker_lng IS NOT NULL AND NEW.latitude IS NOT NULL AND NEW.longitude IS NOT NULL THEN
      v_distance_m := calculate_distance_m(v_worker_lat, v_worker_lng, NEW.latitude, NEW.longitude);
      
      IF v_distance_m > 1000 THEN
        -- Log fraud flag
        INSERT INTO public.fraud_flags (user_id, flag_type, severity, status, description, booking_id, evidence)
        VALUES (
          NEW.worker_id,
          'wallet_abuse',
          'high',
          'open',
          'Attempted ' || NEW.status || ' status update while being ' || ROUND(v_distance_m, 0) || ' meters away.',
          NEW.id,
          jsonb_build_object('distance_m', v_distance_m, 'worker_lat', v_worker_lat, 'worker_lng', v_worker_lng, 'booking_lat', NEW.latitude, 'booking_lng', NEW.longitude)
        );
        
        RAISE EXCEPTION 'Worker is too far from the booking location to update status to % (Distance: %m).', NEW.status, ROUND(v_distance_m, 0);
      END IF;
    END IF;
  END IF;

  -- Cancellation rate check
  IF NEW.status = 'cancelled' AND OLD.status != 'cancelled' THEN
    SELECT value::INTEGER INTO v_cancellation_threshold
    FROM public.platform_config
    WHERE key = 'fraud_cancellation_threshold' LIMIT 1;
    
    v_cancellation_threshold := COALESCE(v_cancellation_threshold, 5);

    SELECT COUNT(*) INTO v_cancel_count
    FROM public.bookings
    WHERE client_id = NEW.client_id
      AND status = 'cancelled'
      AND updated_at >= NOW() - INTERVAL '7 days';

    IF v_cancel_count >= v_cancellation_threshold THEN
      INSERT INTO public.fraud_flags (user_id, flag_type, severity, status, description, booking_id, evidence)
      VALUES (
        NEW.client_id,
        'suspicious_cancellation',
        'medium',
        'open',
        'Client has cancelled ' || (v_cancel_count + 1) || ' bookings in the last 7 days.',
        NEW.id,
        jsonb_build_object('cancel_count_7d', v_cancel_count + 1)
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 11. Update process_online_payment_credit to support locked payment methods (upi, card)
CREATE OR REPLACE FUNCTION public.process_online_payment_credit(p_booking_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_booking RECORD;
  v_wallet RECORD;
  v_new_balance NUMERIC;
  v_worker_credit NUMERIC;
BEGIN
  -- Fetch and lock booking
  SELECT b.id, b.worker_id, b.total_price, b.service_charge, b.visit_charge, b.material_charge, b.payment_method,
         b.discount_amount, b.commission_deducted, b.status
  INTO v_booking
  FROM public.bookings b
  WHERE b.id = p_booking_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking not found: %', p_booking_id;
  END IF;

  IF v_booking.payment_method NOT IN ('upi', 'card') THEN
    RETURN jsonb_build_object('success', false, 'reason', 'This function is only for online payments (upi/card)');
  END IF;

  IF v_booking.commission_deducted THEN
    RETURN jsonb_build_object('success', false, 'reason', 'Payment already processed');
  END IF;

  IF v_booking.worker_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'reason', 'No worker assigned');
  END IF;

  -- Worker receives full amount (working_charge + visit_charge + item_charges) with no commission deduction
  v_worker_credit := COALESCE(v_booking.service_charge, 0) + COALESCE(v_booking.visit_charge, 0) + COALESCE(v_booking.material_charge, 0);

  -- Fetch and lock wallet
  SELECT balance INTO v_wallet
  FROM public.worker_wallets
  WHERE worker_id = v_booking.worker_id
  FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.worker_wallets (worker_id, balance, currency, updated_at)
    VALUES (v_booking.worker_id, v_worker_credit, 'INR', NOW())
    RETURNING * INTO v_wallet;
  ELSE
    v_new_balance := COALESCE(v_wallet.balance, 0) + v_worker_credit;
    
    UPDATE public.worker_wallets
    SET balance = v_new_balance,
        updated_at = NOW()
    WHERE worker_id = v_booking.worker_id;
  END IF;

  -- Log the online credit transaction
  INSERT INTO public.wallet_transactions (
    worker_id, type, amount, balance_after, booking_id, description
  ) VALUES (
    v_booking.worker_id,
    'online_credit',
    v_worker_credit,
    COALESCE(v_new_balance, v_worker_credit),
    p_booking_id,
    'Online payment received — full credit of ₹' || v_worker_credit || ' (zero commission) for booking #' || LEFT(p_booking_id::TEXT, 8)
  );

  -- Mark payment as processed and complete the booking
  UPDATE public.bookings
  SET commission_deducted = TRUE,
      payment_status = 'paid',
      status = 'completed',
      updated_at = NOW()
  WHERE id = p_booking_id;

  -- Update active bookings
  DELETE FROM public.active_bookings WHERE booking_id = p_booking_id;

  -- Set worker status to online/available
  INSERT INTO public.worker_availability (worker_id, status, last_active_at, current_booking_id)
  VALUES (v_booking.worker_id, 'available', NOW(), NULL)
  ON CONFLICT (worker_id) DO UPDATE 
  SET status = 'available', last_active_at = NOW(), current_booking_id = NULL;

  RETURN jsonb_build_object(
    'success', true,
    'credited', v_worker_credit,
    'new_balance', COALESCE(v_new_balance, v_worker_credit)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 12. Update process_booking_commission to clear active_bookings & set worker availability on cash completion
CREATE OR REPLACE FUNCTION public.process_booking_commission(p_booking_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_booking RECORD;
  v_wallet RECORD;
  v_commission_rate NUMERIC;
  v_commission NUMERIC;
  v_new_balance NUMERIC;
BEGIN
  -- Fetch booking details (lock the row to prevent race conditions)
  SELECT b.id, b.worker_id, b.service_charge, b.total_price, b.payment_method,
         b.commission_deducted, b.status, b.commission_amount
  INTO v_booking
  FROM public.bookings b
  WHERE b.id = p_booking_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking not found: %', p_booking_id;
  END IF;

  -- Safety checks
  IF v_booking.commission_deducted THEN
    RETURN jsonb_build_object('success', false, 'reason', 'Commission already deducted');
  END IF;

  IF v_booking.payment_method != 'cash' THEN
    RETURN jsonb_build_object('success', false, 'reason', 'Commission only applies to cash payments');
  END IF;

  IF v_booking.worker_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'reason', 'No worker assigned to booking');
  END IF;

  -- Get commission rate from platform_config
  SELECT COALESCE(value::NUMERIC, 0.10) INTO v_commission_rate
  FROM public.platform_config WHERE key = 'commission_rate' LIMIT 1;

  -- Calculate commission on service_charge (working_charge) only (NOT material_charge, NOT visit_charge)
  v_commission := ROUND(COALESCE(v_booking.service_charge, 0) * v_commission_rate, 2);

  -- Fetch and lock worker wallet
  SELECT balance INTO v_wallet
  FROM public.worker_wallets
  WHERE worker_id = v_booking.worker_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Worker wallet not found for worker: %', v_booking.worker_id;
  END IF;

  v_new_balance := v_wallet.balance - v_commission;

  -- Deduct commission from wallet
  UPDATE public.worker_wallets
  SET balance = v_new_balance,
      updated_at = NOW()
  WHERE worker_id = v_booking.worker_id;

  -- Log the commission transaction
  INSERT INTO public.wallet_transactions (
    worker_id, type, amount, balance_after, booking_id, description
  ) VALUES (
    v_booking.worker_id,
    'commission',
    v_commission,
    v_new_balance,
    p_booking_id,
    'Platform commission (10%) on service charge for booking #' || LEFT(p_booking_id::TEXT, 8)
  );

  -- Mark commission as deducted on booking
  UPDATE public.bookings
  SET commission_deducted = TRUE,
      commission_amount = v_commission,
      status = 'completed',
      payment_status = 'paid',
      updated_at = NOW()
  WHERE id = p_booking_id;

  -- Clear active bookings
  DELETE FROM public.active_bookings WHERE booking_id = p_booking_id;

  -- Set worker status to online/available
  INSERT INTO public.worker_availability (worker_id, status, last_active_at, current_booking_id)
  VALUES (v_booking.worker_id, 'available', NOW(), NULL)
  ON CONFLICT (worker_id) DO UPDATE 
  SET status = 'available', last_active_at = NOW(), current_booking_id = NULL;

  RETURN jsonb_build_object(
    'success', true,
    'commission', v_commission,
    'new_balance', v_new_balance
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 13. Update verify_booking_otp function to comply with strict state transitions
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
    UPDATE public.bookings 
    SET status = 'disputed', updated_at = v_now 
    WHERE id = p_booking_id;

    INSERT INTO public.booking_timeline (booking_id, status, reason, created_by)
    VALUES (p_booking_id, 'disputed', 'OTP verification blocked: too many failed attempts.', v_booking.worker_id);

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

    -- Auto transition otp_verified -> awaiting_payment
    UPDATE public.bookings 
    SET status = 'awaiting_payment', updated_at = v_now 
    WHERE id = p_booking_id;

    UPDATE public.active_bookings 
    SET status = 'awaiting_payment' 
    WHERE booking_id = p_booking_id;

    INSERT INTO public.booking_timeline (booking_id, status, reason, created_by)
    VALUES (p_booking_id, 'awaiting_payment', 'Auto transition to awaiting_payment state.', v_booking.worker_id);

    RETURN jsonb_build_object('success', true);
  ELSE
    -- OTP Mismatch: increment attempts
    UPDATE public.booking_otps SET attempts = attempts + 1 WHERE id = v_otp.id;
    
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
