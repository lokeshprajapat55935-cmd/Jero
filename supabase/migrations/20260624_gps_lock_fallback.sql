-- Migration: 20260624_gps_lock_fallback.sql
-- Description: Updates validate_booking_state_transition() to allow GPS bypass config and handles empty/zero coordinates gracefully.

-- 1. Insert configuration row if it doesn't exist
INSERT INTO public.platform_config (key, value, description)
VALUES (
  'gps_distance_lock_enabled',
  'true',
  'Toggle to enforce GPS distance validation (<1000m) between worker and booking coordinates when starting/completing bookings.'
) ON CONFLICT (key) DO NOTHING;

-- 2. Redefine validate_booking_state_transition() trigger
CREATE OR REPLACE FUNCTION public.validate_booking_state_transition()
RETURNS TRIGGER AS $$
DECLARE
  v_worker_lat NUMERIC;
  v_worker_lng NUMERIC;
  v_distance_m NUMERIC;
  v_cancel_count INTEGER;
  v_cancellation_threshold INTEGER;
  v_is_admin BOOLEAN;
  v_gps_lock_enabled BOOLEAN;
BEGIN
  -- Check if user is admin
  SELECT EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() AND role = 'admin'
  ) INTO v_is_admin;

  -- If status hasn't changed, allow the update
  IF OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  -- Admin can force complete or force cancel from any non-terminal state
  IF v_is_admin AND NEW.status IN ('completed', 'cancelled') THEN
    RETURN NEW;
  END IF;

  -- Allowed transition paths:
  IF OLD.status = 'pending' AND NEW.status NOT IN ('accepted', 'cancelled', 'broadcasting') THEN
    RAISE EXCEPTION 'Invalid transition from pending to %', NEW.status;
  ELSIF OLD.status = 'broadcasting' AND NEW.status NOT IN ('accepted', 'cancelled', 'no_worker_available') THEN
    RAISE EXCEPTION 'Invalid transition from broadcasting to %', NEW.status;
  ELSIF OLD.status = 'accepted' AND NEW.status NOT IN ('worker_arriving', 'en_route', 'cancelled') THEN
    RAISE EXCEPTION 'Invalid transition from accepted to %', NEW.status;
  ELSIF OLD.status = 'worker_arriving' AND NEW.status NOT IN ('arrived', 'work_started', 'cancelled') THEN
    RAISE EXCEPTION 'Invalid transition from worker_arriving to %', NEW.status;
  ELSIF OLD.status = 'en_route' AND NEW.status NOT IN ('started', 'arrived', 'cancelled') THEN
    RAISE EXCEPTION 'Invalid transition from en_route to %', NEW.status;
  ELSIF OLD.status = 'arrived' AND NEW.status NOT IN ('work_started', 'started', 'cancelled') THEN
    RAISE EXCEPTION 'Invalid transition from arrived to %', NEW.status;
  ELSIF OLD.status = 'work_started' AND NEW.status NOT IN ('work_completed', 'cancelled', 'disputed') THEN
    RAISE EXCEPTION 'Invalid transition from work_started to %', NEW.status;
  ELSIF OLD.status = 'started' AND NEW.status NOT IN ('work_completed_pending_otp', 'cancelled', 'disputed') THEN
    RAISE EXCEPTION 'Invalid transition from started to %', NEW.status;
  ELSIF OLD.status = 'work_completed' AND NEW.status NOT IN ('awaiting_item_approval') THEN
    RAISE EXCEPTION 'Invalid transition from work_completed to %', NEW.status;
  ELSIF OLD.status = 'work_completed_pending_otp' AND NEW.status NOT IN ('completed', 'disputed') THEN
    RAISE EXCEPTION 'Invalid transition from work_completed_pending_otp to %', NEW.status;
  ELSIF OLD.status = 'awaiting_item_approval' AND NEW.status NOT IN ('item_approved', 'disputed', 'cancelled') THEN
    RAISE EXCEPTION 'Invalid transition from awaiting_item_approval to %', NEW.status;
  ELSIF OLD.status = 'item_approved' AND NEW.status NOT IN ('otp_generated', 'disputed', 'cancelled') THEN
    RAISE EXCEPTION 'Invalid transition from item_approved to %', NEW.status;
  ELSIF OLD.status = 'otp_generated' AND NEW.status NOT IN ('awaiting_otp', 'otp_verified', 'disputed') THEN
    RAISE EXCEPTION 'Invalid transition from otp_generated to %', NEW.status;
  ELSIF OLD.status = 'awaiting_otp' AND NEW.status NOT IN ('otp_verified', 'disputed') THEN
    RAISE EXCEPTION 'Invalid transition from awaiting_otp to %', NEW.status;
  ELSIF OLD.status = 'otp_verified' AND NEW.status NOT IN ('awaiting_payment', 'disputed') THEN
    RAISE EXCEPTION 'Invalid transition from otp_verified to %', NEW.status;
  ELSIF OLD.status = 'awaiting_payment' AND NEW.status NOT IN ('payment_processing', 'completed', 'failed', 'disputed') THEN
    RAISE EXCEPTION 'Invalid transition from awaiting_payment to %', NEW.status;
  ELSIF OLD.status = 'payment_processing' AND NEW.status NOT IN ('payment_verified', 'completed', 'failed', 'disputed') THEN
    RAISE EXCEPTION 'Invalid transition from payment_processing to %', NEW.status;
  ELSIF OLD.status = 'payment_verified' AND NEW.status NOT IN ('completed') THEN
    RAISE EXCEPTION 'Invalid transition from payment_verified to %', NEW.status;
  ELSIF OLD.status IN ('completed', 'cancelled', 'failed') THEN
    RAISE EXCEPTION 'Cannot transition from terminal state %', OLD.status;
  ELSIF OLD.status = 'disputed' AND NEW.status NOT IN ('completed', 'cancelled') THEN
    RAISE EXCEPTION 'Invalid transition from disputed to %', NEW.status;
  END IF;

  -- Check if GPS lock is enabled in config
  SELECT COALESCE(value::BOOLEAN, TRUE) INTO v_gps_lock_enabled
  FROM public.platform_config
  WHERE key = 'gps_distance_lock_enabled' LIMIT 1;

  IF v_gps_lock_enabled THEN
    -- GPS Fraud Check: verify worker is close to client on work_started/started and work_completed/work_completed_pending_otp status updates
    IF NEW.status IN ('work_started', 'started', 'work_completed', 'work_completed_pending_otp') AND NEW.worker_id IS NOT NULL AND (OLD.status IS DISTINCT FROM NEW.status) THEN
      SELECT latitude, longitude INTO v_worker_lat, v_worker_lng
      FROM public.worker_locations
      WHERE worker_id = NEW.worker_id;

      -- Perform validation only if coordinates are present, non-null, and non-zero (zero = mock location or geolocation failure fallback)
      IF v_worker_lat IS NOT NULL AND v_worker_lng IS NOT NULL AND NEW.latitude IS NOT NULL AND NEW.longitude IS NOT NULL
         AND v_worker_lat != 0 AND v_worker_lng != 0 AND NEW.latitude != 0 AND NEW.longitude != 0 THEN
        
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
