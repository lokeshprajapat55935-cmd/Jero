-- Marketplace core: categories, offline cash bookings, moderation

CREATE TABLE IF NOT EXISTS public.service_categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  icon TEXT,
  sort_order INT DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO public.service_categories (id, name, slug, icon, sort_order) VALUES
  ('electrician', 'Electrician', 'Electrician', 'zap', 1),
  ('plumber', 'Plumber', 'Plumber', 'droplets', 2),
  ('labour', 'Labour', 'Labour', 'hard-hat', 3)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS category TEXT;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS base_service_charge NUMERIC DEFAULT 0;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS visit_charge NUMERIC DEFAULT 0;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS payment_method TEXT DEFAULT 'cash';
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'pending';
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS city_id UUID REFERENCES public.cities(id);

ALTER TABLE public.workers ADD COLUMN IF NOT EXISTS moderation_note TEXT;

ALTER TABLE public.service_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "Categories are public" ON public.service_categories FOR SELECT USING (true);