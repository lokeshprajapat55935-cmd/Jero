-- ============================================================
-- Migration: 20260620_admin_dispatch_analytics.sql
-- Description: Create reporting views and audit logs for Zolvo Admin Center
-- ============================================================

-- 1. View: Booking Analytics
CREATE OR REPLACE VIEW public.reporting_booking_analytics AS
SELECT
  b.created_at::date AS booking_date,
  b.category,
  b.city_id,
  COUNT(*) AS total_bookings,
  COUNT(CASE WHEN b.status IN ('completed', 'paid_completed') THEN 1 END) AS completed_bookings,
  COUNT(CASE WHEN b.status = 'cancelled' THEN 1 END) AS cancelled_bookings,
  AVG(EXTRACT(EPOCH FROM (
    SELECT MIN(t.created_at) FROM public.booking_timeline t 
    WHERE t.booking_id = b.id AND t.status IN ('accepted', 'in_progress', 'completed')
  ) - b.created_at)) AS avg_response_time_seconds,
  AVG(EXTRACT(EPOCH FROM (
    SELECT MAX(t.created_at) FROM public.booking_timeline t 
    WHERE t.booking_id = b.id AND t.status IN ('completed', 'paid_completed')
  ) - (
    SELECT MIN(t.created_at) FROM public.booking_timeline t 
    WHERE t.booking_id = b.id AND t.status IN ('accepted', 'in_progress')
  ))) AS avg_completion_time_seconds
FROM public.bookings b
GROUP BY b.created_at::date, b.category, b.city_id;

-- 2. View: Revenue Analytics
CREATE OR REPLACE VIEW public.reporting_revenue_analytics AS
SELECT
  b.created_at::date AS revenue_date,
  b.category,
  b.city_id,
  SUM(b.total_price) AS gross_revenue,
  SUM(COALESCE(b.commission_amount, 0)) AS platform_revenue,
  SUM(b.total_price - COALESCE(b.commission_amount, 0)) AS worker_earnings
FROM public.bookings b
WHERE b.status IN ('completed', 'paid_completed')
GROUP BY b.created_at::date, b.category, b.city_id;

-- 3. View: Worker Analytics
CREATE OR REPLACE VIEW public.reporting_worker_analytics AS
SELECT
  w.id AS worker_id,
  p.full_name AS name,
  w.category,
  c.name AS city_name,
  w.city_id,
  w.rating_avg AS avg_rating,
  COUNT(CASE WHEN b.status IN ('completed', 'paid_completed') THEN 1 END) AS jobs_completed,
  COUNT(b.id) AS jobs_assigned,
  CASE 
    WHEN COUNT(b.id) > 0 THEN (COUNT(CASE WHEN b.status IN ('completed', 'paid_completed') THEN 1 END)::NUMERIC / COUNT(b.id)::NUMERIC)
    ELSE 0.0
  END AS completion_rate,
  CASE
    WHEN COUNT(da.id) > 0 THEN (COUNT(CASE WHEN da.status = 'accepted' THEN 1 END)::NUMERIC / COUNT(da.id)::NUMERIC)
    ELSE 0.0
  END AS acceptance_rate,
  AVG(EXTRACT(EPOCH FROM (da.responded_at - da.sent_at))) AS avg_response_time_seconds
FROM public.workers w
INNER JOIN public.profiles p ON p.id = w.id
LEFT JOIN public.cities c ON c.id = w.city_id
LEFT JOIN public.bookings b ON b.worker_id = w.id
LEFT JOIN public.dispatch_attempts da ON da.worker_id = w.id
GROUP BY w.id, p.full_name, w.category, c.name, w.city_id, w.rating_avg;

-- 4. View: Customer Analytics
CREATE OR REPLACE VIEW public.reporting_customer_analytics AS
SELECT
  cl.id AS client_id,
  p.full_name AS name,
  cl.city_id,
  c.name AS city_name,
  COUNT(b.id) AS total_bookings,
  COUNT(CASE WHEN b.status IN ('completed', 'paid_completed') THEN 1 END) AS completed_bookings,
  MIN(b.created_at) AS first_booking_at,
  MAX(b.created_at) AS last_booking_at
FROM public.clients cl
INNER JOIN public.profiles p ON p.id = cl.id
LEFT JOIN public.cities c ON c.id = cl.city_id
LEFT JOIN public.bookings b ON b.client_id = cl.id
GROUP BY cl.id, p.full_name, cl.city_id, c.name;

-- 5. View: Fraud Monitoring Dashboard View
CREATE OR REPLACE VIEW public.reporting_fraud_alerts AS
-- Explicit fraud flags from db table (like otp lockout)
SELECT
  ff.id::text,
  ff.user_id,
  p.full_name AS user_name,
  p.role AS user_role,
  ff.flag_type,
  ff.severity,
  ff.status,
  ff.description,
  ff.booking_id,
  ff.evidence,
  ff.created_at
FROM public.fraud_flags ff
LEFT JOIN public.profiles p ON p.id = ff.user_id

UNION ALL

-- Clients with excessive cancellations (> 3 cancellations in last 7 days)
SELECT
  ('cancel-client-' || b.client_id)::text AS id,
  b.client_id AS user_id,
  p.full_name AS user_name,
  'client' AS user_role,
  'suspicious_cancellation' AS flag_type,
  'medium' AS severity,
  'open' AS status,
  'Client has cancelled ' || COUNT(*) || ' bookings in the last 7 days.' AS description,
  NULL::uuid AS booking_id,
  jsonb_build_object('cancellation_count', COUNT(*)) AS evidence,
  MAX(b.updated_at) AS created_at
FROM public.bookings b
INNER JOIN public.profiles p ON p.id = b.client_id
WHERE b.status = 'cancelled' AND b.updated_at >= NOW() - INTERVAL '7 days'
GROUP BY b.client_id, p.full_name
HAVING COUNT(*) > 3

UNION ALL

-- Workers with excessive cancellations (> 2 cancellations in last 7 days)
SELECT
  ('cancel-worker-' || b.worker_id)::text AS id,
  b.worker_id AS user_id,
  p.full_name AS user_name,
  'worker' AS user_role,
  'suspicious_cancellation' AS flag_type,
  'high' AS severity,
  'open' AS status,
  'Worker has cancelled ' || COUNT(*) || ' bookings in the last 7 days.' AS description,
  NULL::uuid AS booking_id,
  jsonb_build_object('cancellation_count', COUNT(*)) AS evidence,
  MAX(b.updated_at) AS created_at
FROM public.bookings b
INNER JOIN public.profiles p ON p.id = b.worker_id
WHERE b.status = 'cancelled' AND b.updated_at >= NOW() - INTERVAL '7 days'
GROUP BY b.worker_id, p.full_name
HAVING COUNT(*) > 2

UNION ALL

-- Fake bookings velocity (> 4 bookings by client in last 24 hours)
SELECT
  ('fake-bookings-' || b.client_id)::text AS id,
  b.client_id AS user_id,
  p.full_name AS user_name,
  'client' AS user_role,
  'fake_booking' AS flag_type,
  'high' AS severity,
  'open' AS status,
  'Client created ' || COUNT(*) || ' bookings in the last 24 hours.' AS description,
  NULL::uuid AS booking_id,
  jsonb_build_object('booking_count', COUNT(*)) AS evidence,
  MAX(b.created_at) AS created_at
FROM public.bookings b
INNER JOIN public.profiles p ON p.id = b.client_id
WHERE b.created_at >= NOW() - INTERVAL '24 hours'
GROUP BY b.client_id, p.full_name
HAVING COUNT(*) > 4

UNION ALL

-- Suspicious review activity (review on booking completed < 2 minutes)
SELECT
  ('suspicious-review-' || r.id)::text AS id,
  r.reviewer_id AS user_id,
  p.full_name AS user_name,
  'client' AS user_role,
  'other' AS flag_type,
  'low' AS severity,
  'open' AS status,
  'Review posted for booking completed abnormally fast (less than 2 minutes).' AS description,
  r.booking_id,
  jsonb_build_object('review_id', r.id, 'rating', r.rating) AS evidence,
  r.created_at
FROM public.reviews r
INNER JOIN public.bookings b ON b.id = r.booking_id
INNER JOIN public.profiles p ON p.id = r.reviewer_id
WHERE b.status IN ('completed', 'paid_completed') 
  AND EXISTS (
    SELECT 1 FROM public.booking_timeline t1
    INNER JOIN public.booking_timeline t2 ON t1.booking_id = t2.booking_id
    WHERE t1.booking_id = b.id
      AND t1.status IN ('accepted', 'in_progress')
      AND t2.status IN ('completed', 'paid_completed')
      AND t2.created_at - t1.created_at < INTERVAL '2 minutes'
  );

-- 6. View: Dispatch History with nested attempts
CREATE OR REPLACE VIEW public.dispatch_history_view AS
SELECT
  dr.id AS dispatch_id,
  dr.booking_id,
  b.category,
  b.status AS booking_status,
  b.client_id,
  pc.full_name AS client_name,
  dr.status AS dispatch_status,
  dr.attempt_count,
  dr.max_attempts,
  dr.current_radius_km,
  dr.created_at AS dispatched_at,
  dr.updated_at AS last_updated_at,
  COALESCE(
    (
      SELECT jsonb_agg(
        jsonb_build_object(
          'attempt_id', da.id,
          'worker_id', da.worker_id,
          'worker_name', pw.full_name,
          'worker_category', w.category,
          'status', da.status,
          'sent_at', da.sent_at,
          'responded_at', da.responded_at,
          'rejection_reason', da.rejection_reason
        ) ORDER BY da.sent_at ASC
      )
      FROM public.dispatch_attempts da
      INNER JOIN public.workers w ON w.id = da.worker_id
      INNER JOIN public.profiles pw ON pw.id = w.id
      WHERE da.dispatch_request_id = dr.id
    ),
    '[]'::jsonb
  ) AS attempts
FROM public.dispatch_requests dr
INNER JOIN public.bookings b ON b.id = dr.booking_id
INNER JOIN public.profiles pc ON pc.id = b.client_id;
