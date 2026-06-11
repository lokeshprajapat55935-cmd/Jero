-- ============================================================
-- Migration: 20260615_booking_engine_enhancements.sql
-- Description: Enhance booking engine with scheduling, images,
--              service_charge fix, and booking image storage bucket.
-- ============================================================

-- 1. Add scheduling and image columns to bookings (idempotent)
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS scheduled_date DATE,
  ADD COLUMN IF NOT EXISTS scheduled_time_slot TEXT, -- 'morning' | 'afternoon' | 'evening' | 'asap'
  ADD COLUMN IF NOT EXISTS image_urls TEXT[] DEFAULT '{}';

-- Ensure service_charge is settable at creation time
-- (already exists from 20260528_wallet_commission.sql, no-op if already present)
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS service_charge NUMERIC DEFAULT 0;

-- 2. Update the create_booking_dispatch RPC to accept scheduling + image fields
CREATE OR REPLACE FUNCTION public.create_booking_dispatch(
  p_client_id UUID,
  p_category TEXT,
  p_description TEXT,
  p_location_address TEXT,
  p_latitude NUMERIC DEFAULT NULL,
  p_longitude NUMERIC DEFAULT NULL,
  p_area_id UUID DEFAULT NULL,
  p_payment_method TEXT DEFAULT 'cash',
  p_ip_address TEXT DEFAULT NULL,
  p_user_agent TEXT DEFAULT NULL,
  p_scheduled_date DATE DEFAULT NULL,
  p_scheduled_time_slot TEXT DEFAULT 'asap',
  p_image_urls TEXT[] DEFAULT '{}'
)
RETURNS JSONB AS $$
DECLARE
  v_booking_id UUID;
  v_city_id UUID;
  v_service_charge NUMERIC := 0;
  v_existing_booking_id UUID;
BEGIN
  -- 1. Duplicate booking guard: check if client already has an active booking for same category in last 10 min
  SELECT id INTO v_existing_booking_id
  FROM public.bookings
  WHERE client_id = p_client_id
    AND category = p_category
    AND status IN ('pending', 'broadcasting', 'accepted')
    AND created_at > NOW() - INTERVAL '10 minutes'
  LIMIT 1;

  IF v_existing_booking_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', true,
      'booking_id', v_existing_booking_id,
      'status', 'duplicate',
      'message', 'You already have an active booking for this category.'
    );
  END IF;

  -- 2. Resolve city from area or default to active city
  IF p_area_id IS NOT NULL THEN
    SELECT city_id INTO v_city_id FROM public.areas WHERE id = p_area_id LIMIT 1;
  END IF;
  IF v_city_id IS NULL THEN
    SELECT id INTO v_city_id FROM public.cities WHERE slug = 'bhilwara' AND is_active = TRUE LIMIT 1;
  END IF;

  -- 3. Lookup service_charge from platform config / category pricing
  -- (Will be 0 by default; worker sets actual service_charge when accepting)

  -- 4. Create the booking
  INSERT INTO public.bookings (
    client_id,
    category,
    description,
    location_address,
    latitude,
    longitude,
    area_id,
    city_id,
    payment_method,
    status,
    total_price,
    service_charge,
    scheduled_at,
    scheduled_date,
    scheduled_time_slot,
    image_urls,
    created_at,
    updated_at
  ) VALUES (
    p_client_id,
    p_category,
    p_description,
    p_location_address,
    p_latitude,
    p_longitude,
    p_area_id,
    v_city_id,
    p_payment_method,
    'broadcasting',
    0,
    0,
    COALESCE(
      CASE WHEN p_scheduled_date IS NOT NULL
        THEN (p_scheduled_date || ' ' ||
          CASE p_scheduled_time_slot
            WHEN 'morning' THEN '09:00:00'
            WHEN 'afternoon' THEN '13:00:00'
            WHEN 'evening' THEN '17:00:00'
            ELSE '00:00:00'
          END)::TIMESTAMPTZ
        ELSE NOW()
      END,
      NOW()
    ),
    p_scheduled_date,
    COALESCE(p_scheduled_time_slot, 'asap'),
    COALESCE(p_image_urls, '{}'),
    NOW(),
    NOW()
  )
  RETURNING id INTO v_booking_id;

  -- 5. Create dispatch request
  INSERT INTO public.dispatch_requests (
    booking_id,
    status,
    max_radius_km,
    current_radius_km,
    created_at,
    updated_at
  ) VALUES (
    v_booking_id,
    'searching',
    15.0,
    5.0,
    NOW(),
    NOW()
  );

  -- 6. Find and notify nearby approved workers
  PERFORM public.notify_nearby_workers(v_booking_id, p_category, v_city_id, p_latitude, p_longitude, 5.0);

  RETURN jsonb_build_object(
    'success', true,
    'booking_id', v_booking_id,
    'status', 'created'
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false,
    'error', SQLERRM,
    'code', 500
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 3. Notify nearby workers function (idempotent)
CREATE OR REPLACE FUNCTION public.notify_nearby_workers(
  p_booking_id UUID,
  p_category TEXT,
  p_city_id UUID,
  p_latitude NUMERIC,
  p_longitude NUMERIC,
  p_radius_km NUMERIC DEFAULT 5.0
)
RETURNS INTEGER AS $$
DECLARE
  v_worker RECORD;
  v_notified INTEGER := 0;
BEGIN
  FOR v_worker IN
    SELECT w.id
    FROM public.workers w
    INNER JOIN public.worker_availability wa ON wa.worker_id = w.id
    LEFT JOIN public.worker_locations wl ON wl.worker_id = w.id
    WHERE w.status = 'approved'
      AND w.category = p_category
      AND wa.status = 'available'
      AND (
        -- City match
        w.city_id = p_city_id
        OR wl.city_id = p_city_id
        -- Or within radius if GPS available
        OR (
          p_latitude IS NOT NULL AND p_longitude IS NOT NULL
          AND wl.latitude IS NOT NULL AND wl.longitude IS NOT NULL
          AND public.calculate_distance_m(p_latitude, p_longitude, wl.latitude, wl.longitude) <= p_radius_km * 1000
        )
      )
    ORDER BY
      CASE WHEN wl.latitude IS NOT NULL AND p_latitude IS NOT NULL
        THEN public.calculate_distance_m(p_latitude, p_longitude, wl.latitude, wl.longitude)
        ELSE 99999999
      END ASC,
      w.rating_avg DESC
    LIMIT 20
  LOOP
    -- Insert notification for each worker
    INSERT INTO public.notifications (
      user_id, type, title, content, link_url, metadata, is_read
    ) VALUES (
      v_worker.id,
      'booking_request',
      'New Job Available!',
      'A new ' || p_category || ' job is available near you.',
      '/partner/jobs',
      jsonb_build_object('booking_id', p_booking_id),
      FALSE
    )
    ON CONFLICT DO NOTHING;

    -- Log dispatch attempt
    INSERT INTO public.dispatch_attempts (
      dispatch_request_id,
      worker_id,
      status
    )
    SELECT dr.id, v_worker.id, 'sent'
    FROM public.dispatch_requests dr
    WHERE dr.booking_id = p_booking_id
    ON CONFLICT DO NOTHING;

    v_notified := v_notified + 1;
  END LOOP;

  -- Update notified_worker_count
  UPDATE public.bookings
    SET notified_worker_count = v_notified
    WHERE id = p_booking_id;

  RETURN v_notified;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 4. Register booking-images storage bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'booking-images',
  'booking-images',
  true,
  5242880, -- 5MB
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- 5. RLS policies for booking-images bucket
DROP POLICY IF EXISTS "Public read booking images" ON storage.objects;
CREATE POLICY "Public read booking images" ON storage.objects
  FOR SELECT USING (bucket_id = 'booking-images');

DROP POLICY IF EXISTS "Authenticated clients upload booking images" ON storage.objects;
CREATE POLICY "Authenticated clients upload booking images" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'booking-images'
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- 6. Add index for performance on new columns
CREATE INDEX IF NOT EXISTS idx_bookings_scheduled_date ON public.bookings(scheduled_date)
  WHERE scheduled_date IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_bookings_category_status ON public.bookings(category, status);
