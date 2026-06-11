-- ============================================================
-- Migration: 20260623_predefined_service_catalog.sql
-- Description: Database schema and seed data for the predefined 
--              Service Catalog System (Categories, Services, Sub-services).
--              Also updates state transitions to allow arrived states.
-- ============================================================

-- 1. Insert missing categories to service_categories table
INSERT INTO public.service_categories (id, name, slug, icon, sort_order, is_active)
VALUES
  ('electrician', 'Electrician', 'electrician', 'zap', 1, TRUE),
  ('plumber', 'Plumber', 'plumber', 'droplets', 2, TRUE),
  ('labour', 'Labour', 'labour', 'hard-hat', 3, TRUE),
  ('ac_repair', 'AC Repair', 'ac-repair', 'wind', 4, TRUE),
  ('carpenter', 'Carpenter', 'carpenter', 'hammer', 5, TRUE),
  ('painter', 'Painter', 'painter', 'paint-brush', 6, TRUE),
  ('cleaning', 'Cleaning', 'cleaning', 'brush', 7, TRUE),
  ('ro_service', 'RO Service', 'ro-service', 'filter', 8, TRUE)
ON CONFLICT (id) DO UPDATE 
SET name = EXCLUDED.name,
    slug = EXCLUDED.slug,
    icon = EXCLUDED.icon,
    sort_order = EXCLUDED.sort_order;

-- 2. Create catalog_services table
CREATE TABLE IF NOT EXISTS public.catalog_services (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  category_id TEXT NOT NULL REFERENCES public.service_categories(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  is_active BOOLEAN DEFAULT TRUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  UNIQUE (category_id, name)
);

-- 3. Create catalog_sub_services table
CREATE TABLE IF NOT EXISTS public.catalog_sub_services (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  service_id UUID NOT NULL REFERENCES public.catalog_services(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  base_service_charge NUMERIC DEFAULT 0 NOT NULL,
  visit_charge NUMERIC DEFAULT 0 NOT NULL,
  is_active BOOLEAN DEFAULT TRUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  UNIQUE (service_id, name)
);

-- 4. Enable Row Level Security (RLS)
ALTER TABLE public.catalog_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_sub_services ENABLE ROW LEVEL SECURITY;

-- 5. Create RLS Policies
DROP POLICY IF EXISTS "Catalog services are public select" ON public.catalog_services;
CREATE POLICY "Catalog services are public select" ON public.catalog_services
  FOR SELECT USING (is_active = TRUE);

DROP POLICY IF EXISTS "Catalog sub-services are public select" ON public.catalog_sub_services;
CREATE POLICY "Catalog sub-services are public select" ON public.catalog_sub_services
  FOR SELECT USING (is_active = TRUE);

DROP POLICY IF EXISTS "Admins can manage catalog_services" ON public.catalog_services;
CREATE POLICY "Admins can manage catalog_services" ON public.catalog_services
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Admins can manage catalog_sub_services" ON public.catalog_sub_services;
CREATE POLICY "Admins can manage catalog_sub_services" ON public.catalog_sub_services
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- 6. Update validate_booking_state_transition() to support arrived states
CREATE OR REPLACE FUNCTION public.validate_booking_state_transition()
RETURNS TRIGGER AS $$
DECLARE
  v_worker_lat NUMERIC;
  v_worker_lng NUMERIC;
  v_distance_m NUMERIC;
  v_cancel_count INTEGER;
  v_cancellation_threshold INTEGER;
  v_is_admin BOOLEAN;
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

  -- GPS Fraud Check: verify worker is close to client on work_started/started and work_completed/work_completed_pending_otp status updates
  IF NEW.status IN ('work_started', 'started', 'work_completed', 'work_completed_pending_otp') AND NEW.worker_id IS NOT NULL AND (OLD.status IS DISTINCT FROM NEW.status) THEN
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

-- 7. Seed service catalog data
DO $$
DECLARE
  v_cat_electrician TEXT := 'electrician';
  v_cat_plumber TEXT := 'plumber';
  v_cat_ac_repair TEXT := 'ac_repair';
  v_cat_carpenter TEXT := 'carpenter';
  v_cat_painter TEXT := 'painter';
  v_cat_cleaning TEXT := 'cleaning';
  v_cat_ro_service TEXT := 'ro_service';

  v_srv_fan UUID;
  v_srv_wiring UUID;
  v_srv_mcb UUID;
  v_srv_switchboard UUID;
  v_srv_light UUID;
  v_srv_doorbell UUID;

  v_srv_tap UUID;
  v_srv_leakage UUID;
  v_srv_pipe UUID;
  v_srv_flush UUID;
  v_srv_watertank UUID;
  v_srv_toilet UUID;

  v_srv_ac UUID;

  v_srv_furniture UUID;

  v_srv_painting UUID;

  v_srv_deepclean UUID;
  
  v_srv_purifier UUID;
BEGIN
  -- ==========================================
  -- ELECTRICIAN SERVICES
  -- ==========================================
  INSERT INTO public.catalog_services (category_id, name) VALUES (v_cat_electrician, 'Fan')
    ON CONFLICT (category_id, name) DO UPDATE SET name = EXCLUDED.name RETURNING id INTO v_srv_fan;
  INSERT INTO public.catalog_services (category_id, name) VALUES (v_cat_electrician, 'Wiring')
    ON CONFLICT (category_id, name) DO UPDATE SET name = EXCLUDED.name RETURNING id INTO v_srv_wiring;
  INSERT INTO public.catalog_services (category_id, name) VALUES (v_cat_electrician, 'MCB & Fuses')
    ON CONFLICT (category_id, name) DO UPDATE SET name = EXCLUDED.name RETURNING id INTO v_srv_mcb;
  INSERT INTO public.catalog_services (category_id, name) VALUES (v_cat_electrician, 'Switchboard')
    ON CONFLICT (category_id, name) DO UPDATE SET name = EXCLUDED.name RETURNING id INTO v_srv_switchboard;
  INSERT INTO public.catalog_services (category_id, name) VALUES (v_cat_electrician, 'Light & Bulbs')
    ON CONFLICT (category_id, name) DO UPDATE SET name = EXCLUDED.name RETURNING id INTO v_srv_light;
  INSERT INTO public.catalog_services (category_id, name) VALUES (v_cat_electrician, 'Door Bell')
    ON CONFLICT (category_id, name) DO UPDATE SET name = EXCLUDED.name RETURNING id INTO v_srv_doorbell;

  -- Electrician Sub-services
  INSERT INTO public.catalog_sub_services (service_id, name, description, base_service_charge, visit_charge)
  VALUES 
    (v_srv_fan, 'Fan Repair', 'Repairing noisy ceiling, table or exhaust fans', 200, 50),
    (v_srv_fan, 'Fan Installation', 'Installation of a new ceiling, wall or exhaust fan', 250, 50)
  ON CONFLICT (service_id, name) DO NOTHING;

  INSERT INTO public.catalog_sub_services (service_id, name, description, base_service_charge, visit_charge)
  VALUES 
    (v_srv_wiring, 'Wiring Problem', 'Fixing electrical short circuits, burnt wire replacement, or diagnostic check', 350, 50)
  ON CONFLICT (service_id, name) DO NOTHING;

  INSERT INTO public.catalog_sub_services (service_id, name, description, base_service_charge, visit_charge)
  VALUES 
    (v_srv_mcb, 'MCB Issue', 'Replacing faulty MCB, distribution board checking, or fuse replacement', 250, 50)
  ON CONFLICT (service_id, name) DO NOTHING;

  INSERT INTO public.catalog_sub_services (service_id, name, description, base_service_charge, visit_charge)
  VALUES 
    (v_srv_switchboard, 'Switch Board Repair', 'Repairing loose connections or replacing switches, sockets, and regulators', 150, 50)
  ON CONFLICT (service_id, name) DO NOTHING;

  INSERT INTO public.catalog_sub_services (service_id, name, description, base_service_charge, visit_charge)
  VALUES 
    (v_srv_light, 'Light Installation', 'Installation of tube lights, LED panels, decorative chandeliers, or holder repair', 120, 50)
  ON CONFLICT (service_id, name) DO NOTHING;

  INSERT INTO public.catalog_sub_services (service_id, name, description, base_service_charge, visit_charge)
  VALUES 
    (v_srv_doorbell, 'Door Bell Repair', 'Fixing or installing electric wired or wireless doorbells', 100, 50)
  ON CONFLICT (service_id, name) DO NOTHING;

  -- ==========================================
  -- PLUMBER SERVICES
  -- ==========================================
  INSERT INTO public.catalog_services (category_id, name) VALUES (v_cat_plumber, 'Taps & Faucets')
    ON CONFLICT (category_id, name) DO UPDATE SET name = EXCLUDED.name RETURNING id INTO v_srv_tap;
  INSERT INTO public.catalog_services (category_id, name) VALUES (v_cat_plumber, 'Leakage Repair')
    ON CONFLICT (category_id, name) DO UPDATE SET name = EXCLUDED.name RETURNING id INTO v_srv_leakage;
  INSERT INTO public.catalog_services (category_id, name) VALUES (v_cat_plumber, 'Pipes & Fittings')
    ON CONFLICT (category_id, name) DO UPDATE SET name = EXCLUDED.name RETURNING id INTO v_srv_pipe;
  INSERT INTO public.catalog_services (category_id, name) VALUES (v_cat_plumber, 'Flush Repair')
    ON CONFLICT (category_id, name) DO UPDATE SET name = EXCLUDED.name RETURNING id INTO v_srv_flush;
  INSERT INTO public.catalog_services (category_id, name) VALUES (v_cat_plumber, 'Water Tank')
    ON CONFLICT (category_id, name) DO UPDATE SET name = EXCLUDED.name RETURNING id INTO v_srv_watertank;
  INSERT INTO public.catalog_services (category_id, name) VALUES (v_cat_plumber, 'Toilet Blockage')
    ON CONFLICT (category_id, name) DO UPDATE SET name = EXCLUDED.name RETURNING id INTO v_srv_toilet;

  -- Plumber Sub-services
  INSERT INTO public.catalog_sub_services (service_id, name, description, base_service_charge, visit_charge)
  VALUES 
    (v_srv_tap, 'Tap Repair', 'Fixing dripping taps, faucet washers, or installing new mixers', 150, 50)
  ON CONFLICT (service_id, name) DO NOTHING;

  INSERT INTO public.catalog_sub_services (service_id, name, description, base_service_charge, visit_charge)
  VALUES 
    (v_srv_leakage, 'Leakage Repair', 'Fixing visible leaks in basin pipes, kitchen sinks, or shower connections', 200, 50)
  ON CONFLICT (service_id, name) DO NOTHING;

  INSERT INTO public.catalog_sub_services (service_id, name, description, base_service_charge, visit_charge)
  VALUES 
    (v_srv_pipe, 'Pipe Installation', 'Installing new GI, CPVC, or PVC pipes in bathroom, kitchen, or balcony', 450, 50)
  ON CONFLICT (service_id, name) DO NOTHING;

  INSERT INTO public.catalog_sub_services (service_id, name, description, base_service_charge, visit_charge)
  VALUES 
    (v_srv_flush, 'Flush Repair', 'Repairing toilet flush tanks, push buttons, syphon valves, or ball cock issues', 250, 50)
  ON CONFLICT (service_id, name) DO NOTHING;

  INSERT INTO public.catalog_sub_services (service_id, name, description, base_service_charge, visit_charge)
  VALUES 
    (v_srv_watertank, 'Water Tank Issue', 'Tank cleaning or fixing automatic float valve/overflow issues', 600, 50)
  ON CONFLICT (service_id, name) DO NOTHING;

  INSERT INTO public.catalog_sub_services (service_id, name, description, base_service_charge, visit_charge)
  VALUES 
    (v_srv_toilet, 'Toilet Blockage', 'Clearing blockages in western/indian toilets, drains, and washbasins', 350, 50)
  ON CONFLICT (service_id, name) DO NOTHING;

  -- ==========================================
  -- AC REPAIR SERVICES
  -- ==========================================
  INSERT INTO public.catalog_services (category_id, name) VALUES (v_cat_ac_repair, 'Air Conditioner')
    ON CONFLICT (category_id, name) DO UPDATE SET name = EXCLUDED.name RETURNING id INTO v_srv_ac;

  -- AC Repair Sub-services
  INSERT INTO public.catalog_sub_services (service_id, name, description, base_service_charge, visit_charge)
  VALUES 
    (v_srv_ac, 'AC Not Cooling', 'Diagnosis and fixing of cooling related problems in Split or Window AC', 400, 100),
    (v_srv_ac, 'Gas Refill', 'Complete refrigerant gas leakage repair and refill service', 1500, 100),
    (v_srv_ac, 'Water Leakage', 'Cleaning and unclogging AC drain pipe to stop internal water leakage', 300, 100),
    (v_srv_ac, 'AC Installation', 'Installing indoor and outdoor units of split/window AC', 1000, 100),
    (v_srv_ac, 'AC Uninstallation', 'Safe uninstallation of existing split/window AC units', 500, 100),
    (v_srv_ac, 'Annual Service', 'Deep wet washing, filter cleaning, and diagnostics check', 600, 100)
  ON CONFLICT (service_id, name) DO NOTHING;

  -- ==========================================
  -- CARPENTER SERVICES
  -- ==========================================
  INSERT INTO public.catalog_services (category_id, name) VALUES (v_cat_carpenter, 'Furniture & Fittings')
    ON CONFLICT (category_id, name) DO UPDATE SET name = EXCLUDED.name RETURNING id INTO v_srv_furniture;

  -- Carpenter Sub-services
  INSERT INTO public.catalog_sub_services (service_id, name, description, base_service_charge, visit_charge)
  VALUES 
    (v_srv_furniture, 'Door Repair', 'Fixing door alignment, locks, hinges, handles, or wooden swelling', 200, 50),
    (v_srv_furniture, 'Furniture Assembly', 'Assembly of flat-pack wardrobes, beds, tables, and cabinets', 400, 50),
    (v_srv_furniture, 'Cabinet Fitting', 'Installing kitchen baskets, channels, shelves, or cabinet doors', 300, 50),
    (v_srv_furniture, 'Window Repair', 'Fixing wooden window frames, mesh channels, or glass pane replacement', 180, 50),
    (v_srv_furniture, 'Custom Woodwork', 'Making customized wooden structures, shelves, or customized partitioning', 750, 50),
    (v_srv_furniture, 'Other Carpentry', 'Minor furniture repairs, drilling holes, or pegboard fitting', 200, 50)
  ON CONFLICT (service_id, name) DO NOTHING;

  -- ==========================================
  -- PAINTER SERVICES
  -- ==========================================
  INSERT INTO public.catalog_services (category_id, name) VALUES (v_cat_painter, 'Painting & Coating')
    ON CONFLICT (category_id, name) DO UPDATE SET name = EXCLUDED.name RETURNING id INTO v_srv_painting;

  -- Painter Sub-services
  INSERT INTO public.catalog_sub_services (service_id, name, description, base_service_charge, visit_charge)
  VALUES 
    (v_srv_painting, 'Room Painting', 'Single room wall painting with premium/standard emulsions', 1800, 100),
    (v_srv_painting, 'Full House Painting', 'Complete interior & exterior painting inspection and execution', 8000, 100),
    (v_srv_painting, 'Touch Up Work', 'Patch painting, crack filling, putty filing, and localized painting repair', 800, 100),
    (v_srv_painting, 'Waterproofing', 'Wall dampness treatment, terrace waterproofing coating, and anti-fungal prep', 2500, 100),
    (v_srv_painting, 'Other Painting', 'Grill painting, doors polishing, or texture wall painting', 1200, 100)
  ON CONFLICT (service_id, name) DO NOTHING;

  -- ==========================================
  -- CLEANING SERVICES
  -- ==========================================
  INSERT INTO public.catalog_services (category_id, name) VALUES (v_cat_cleaning, 'Home Cleaning')
    ON CONFLICT (category_id, name) DO UPDATE SET name = EXCLUDED.name RETURNING id INTO v_srv_deepclean;

  -- Cleaning Sub-services
  INSERT INTO public.catalog_sub_services (service_id, name, description, base_service_charge, visit_charge)
  VALUES 
    (v_srv_deepclean, 'Deep Cleaning', 'Complete deep cleaning of standard bedrooms, halls, and balconies', 2000, 100),
    (v_srv_deepclean, 'Bathroom Cleaning', 'Scrubbing tiles, toilet seats, washbasins, and taps sanitization', 350, 50),
    (v_srv_deepclean, 'Kitchen Cleaning', 'Cleaning counters, sink, tiles, external chimneys, and cabinet sanitizing', 1000, 100),
    (v_srv_deepclean, 'Office Cleaning', 'Sweeping, vacuuming, desk cleaning, glass wiping, and floor cleaning', 2500, 100),
    (v_srv_deepclean, 'Post-Construction Cleaning', 'Removing paint stains, grout, construction debris, and deep wash', 4000, 100)
  ON CONFLICT (service_id, name) DO NOTHING;

  -- ==========================================
  -- RO SERVICE SERVICES
  -- ==========================================
  INSERT INTO public.catalog_services (category_id, name) VALUES (v_cat_ro_service, 'Water Purifier')
    ON CONFLICT (category_id, name) DO UPDATE SET name = EXCLUDED.name RETURNING id INTO v_srv_purifier;

  -- RO Sub-services
  INSERT INTO public.catalog_sub_services (service_id, name, description, base_service_charge, visit_charge)
  VALUES 
    (v_srv_purifier, 'Filter Replacement', 'Replacing sediment filter, carbon filter, or RO membrane', 700, 50),
    (v_srv_purifier, 'Water Purifier Repair', 'Fixing auto-shutoff issues, booster pump, low water flow, or power problems', 300, 50),
    (v_srv_purifier, 'RO Installation', 'Mounting and installation of water purifier with plumbing lines', 400, 50),
    (v_srv_purifier, 'Annual Maintenance', 'Comprehensive cleaning, TDS testing, and preventative service contract', 1000, 50)
  ON CONFLICT (service_id, name) DO NOTHING;

END $$;
