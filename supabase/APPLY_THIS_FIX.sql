-- CRITICAL FIX: Run this in Supabase SQL Editor
-- ============================================================
-- Step 1: Fix REPLICA IDENTITY for Realtime to send full rows
ALTER TABLE public.notifications REPLICA IDENTITY FULL;

-- Step 2: Add notifications to realtime publication
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'notifications'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
  END IF;
END $$;

-- Step 3: Fix get_nearby_dispatch_workers (wrong status values)
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
      LEAST(1.0, GREATEST(-1.0,
        cos(radians(p_latitude)) * cos(radians(wl.latitude)) *
        cos(radians(wl.longitude) - radians(p_longitude)) +
        sin(radians(p_latitude)) * sin(radians(wl.latitude))
      ))
    ))::numeric AS distance_km,
    w.rating_avg,
    w.review_count,
    wl.latitude,
    wl.longitude
  FROM public.workers w
  JOIN public.worker_locations wl ON wl.worker_id = w.id
  JOIN public.worker_availability wa ON wa.worker_id = w.id
  WHERE w.status = 'approved'
    AND w.category = p_category
    AND wa.status = 'online'
    AND wl.latitude IS NOT NULL
    AND wl.longitude IS NOT NULL
    AND (6371 * acos(
      LEAST(1.0, GREATEST(-1.0,
        cos(radians(p_latitude)) * cos(radians(wl.latitude)) *
        cos(radians(wl.longitude) - radians(p_longitude)) +
        sin(radians(p_latitude)) * sin(radians(wl.latitude))
      ))
    )) <= p_radius_km
  ORDER BY distance_km ASC, w.rating_avg DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 4: Fix stale 'available' worker availability rows
UPDATE public.worker_availability
SET status = 'online'
WHERE status = 'available';

-- Step 5: Add indexes for notification performance
CREATE INDEX IF NOT EXISTS idx_notifications_user_type_created
  ON public.notifications(user_id, type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
  ON public.notifications(user_id, is_read)
  WHERE is_read = FALSE;

-- Verification
SELECT relreplident FROM pg_class WHERE relname = 'notifications';
-- Expected: 'f' (FULL)
SELECT tablename FROM pg_publication_tables
WHERE pubname = 'supabase_realtime' AND tablename = 'notifications';
-- Expected: 1 row
SELECT status, count(*) FROM worker_availability GROUP BY status;
-- Expected: no 'available' rows