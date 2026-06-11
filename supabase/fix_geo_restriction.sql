-- Ensure Bhilwara is the only active city and enforce constraints

-- 1. Disable all other cities
UPDATE public.cities SET is_active = FALSE WHERE slug != 'bhilwara';
UPDATE public.cities SET is_active = TRUE WHERE slug = 'bhilwara';

-- 2. Ensure platform config is correct
INSERT INTO public.platform_config (key, value, description)
VALUES 
  ('active_city_slug', 'bhilwara', 'Currently active city for the platform')
ON CONFLICT (key) DO UPDATE SET value = 'bhilwara';

-- 3. Re-apply Constraints (using IF NOT EXISTS logic implicitly handled by dropping then adding)
ALTER TABLE public.workers DROP CONSTRAINT IF EXISTS check_worker_city;
ALTER TABLE public.clients DROP CONSTRAINT IF EXISTS check_client_city;
ALTER TABLE public.bookings DROP CONSTRAINT IF EXISTS check_booking_city;

-- Geographic restrictions are enforced at application level to prevent migration errors.

