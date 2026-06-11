-- Migration: Ratings & Reviews System (Two-way reviews, immutability, statistics syncing, and analytics)

-- 1. Drop old structures to avoid conflicts
DROP TRIGGER IF EXISTS on_review_changed ON public.reviews;
DROP FUNCTION IF EXISTS public.update_worker_rating();
DROP TABLE IF EXISTS public.review_tags CASCADE;
DROP TABLE IF EXISTS public.reviews CASCADE;

-- 2. Create the new reviews table
CREATE TABLE public.reviews (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  booking_id UUID REFERENCES public.bookings(id) ON DELETE CASCADE NOT NULL,
  worker_id UUID REFERENCES public.workers(id) ON DELETE CASCADE NOT NULL,
  customer_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  reviewer_role VARCHAR NOT NULL CHECK (reviewer_role IN ('client', 'worker')),
  
  -- Rating and review text
  rating NUMERIC(3,2) CHECK (rating >= 1.0 AND rating <= 5.0),
  review_text TEXT,
  tags TEXT[], -- Selected tags (e.g. 'Professional', 'On Time') stored in-row for fast access
  
  -- Worker rating customer details
  rating_behavior INTEGER CHECK (rating_behavior >= 1 AND rating_behavior <= 5),
  rating_cooperation INTEGER CHECK (rating_cooperation >= 1 AND rating_cooperation <= 5),
  rating_payment INTEGER CHECK (rating_payment >= 1 AND rating_payment <= 5),
  
  -- Admin controls
  is_hidden BOOLEAN DEFAULT FALSE NOT NULL,
  is_flagged BOOLEAN DEFAULT FALSE NOT NULL,
  
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  
  -- Enforce exactly one review per booking per participant role
  CONSTRAINT unique_booking_reviewer_role UNIQUE(booking_id, reviewer_role)
);

-- 3. Create the review_tags junction table (for search/index normalization)
CREATE TABLE public.review_tags (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  review_id UUID REFERENCES public.reviews(id) ON DELETE CASCADE NOT NULL,
  tag VARCHAR NOT NULL
);

-- 4. Enable Row Level Security (RLS)
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.review_tags ENABLE ROW LEVEL SECURITY;

-- 5. Stored Procedures and Triggers

-- A. Validate review insertions (completeness, participant authorization, field checks)
CREATE OR REPLACE FUNCTION public.validate_review_insertion()
RETURNS TRIGGER AS $$
DECLARE
  v_status VARCHAR;
  v_client_id UUID;
  v_worker_id UUID;
BEGIN
  -- Fetch booking status and participants
  SELECT status, client_id, worker_id INTO v_status, v_client_id, v_worker_id
  FROM public.bookings
  WHERE id = NEW.booking_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking % not found.', NEW.booking_id;
  END IF;

  -- Verify booking is completed
  IF v_status IS DISTINCT FROM 'completed' THEN
    RAISE EXCEPTION 'Reviews can only be created for completed bookings.';
  END IF;

  -- Verify review IDs match booking participants
  IF NEW.customer_id IS DISTINCT FROM v_client_id THEN
    RAISE EXCEPTION 'customer_id does not match the client of the booking.';
  END IF;

  IF NEW.worker_id IS DISTINCT FROM v_worker_id THEN
    RAISE EXCEPTION 'worker_id does not match the worker of the booking.';
  END IF;

  -- Check if reviewer matches role
  IF NEW.reviewer_role = 'client' THEN
    -- Check if rating is provided
    IF NEW.rating IS NULL THEN
      RAISE EXCEPTION 'Rating is required for customer reviews.';
    END IF;
  ELSIF NEW.reviewer_role = 'worker' THEN
    -- Check if worker rating fields are provided
    IF NEW.rating_behavior IS NULL OR NEW.rating_cooperation IS NULL OR NEW.rating_payment IS NULL THEN
      RAISE EXCEPTION 'Worker reviews must rate customer behavior, cooperation, and payment experience.';
    END IF;
    -- Compute average rating
    NEW.rating := ROUND((NEW.rating_behavior + NEW.rating_cooperation + NEW.rating_payment)::NUMERIC / 3.0, 2);
  ELSE
    RAISE EXCEPTION 'Invalid reviewer role. Must be client or worker.';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER before_review_insert
  BEFORE INSERT ON public.reviews
  FOR EACH ROW EXECUTE FUNCTION public.validate_review_insertion();

-- B. Prevent review updates after submission (except admin moderation toggling is_hidden/is_flagged)
CREATE OR REPLACE FUNCTION public.prevent_review_updates()
RETURNS TRIGGER AS $$
BEGIN
  -- Check if the current user has admin role
  IF EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  ) THEN
    -- Admin can only change is_hidden or is_flagged.
    -- Ensure no other fields were modified.
    IF OLD.id IS DISTINCT FROM NEW.id OR
       OLD.booking_id IS DISTINCT FROM NEW.booking_id OR
       OLD.worker_id IS DISTINCT FROM NEW.worker_id OR
       OLD.customer_id IS DISTINCT FROM NEW.customer_id OR
       OLD.reviewer_role IS DISTINCT FROM NEW.reviewer_role OR
       OLD.rating IS DISTINCT FROM NEW.rating OR
       OLD.review_text IS DISTINCT FROM NEW.review_text OR
       OLD.tags IS DISTINCT FROM NEW.tags OR
       OLD.rating_behavior IS DISTINCT FROM NEW.rating_behavior OR
       OLD.rating_cooperation IS DISTINCT FROM NEW.rating_cooperation OR
       OLD.rating_payment IS DISTINCT FROM NEW.rating_payment OR
       OLD.created_at IS DISTINCT FROM NEW.created_at THEN
      RAISE EXCEPTION 'Admins can only moderate visibility (is_hidden) or flag status (is_flagged). Content is immutable.';
    END IF;
    RETURN NEW;
  ELSE
    -- Non-admins cannot update reviews at all
    RAISE EXCEPTION 'Reviews are immutable and cannot be updated after submission.';
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER before_review_update
  BEFORE UPDATE ON public.reviews
  FOR EACH ROW EXECUTE FUNCTION public.prevent_review_updates();

-- C. Synchronize worker stats (rating_avg, review_count) in real time
CREATE OR REPLACE FUNCTION public.sync_worker_review_stats()
RETURNS TRIGGER AS $$
DECLARE
  v_worker_id UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_worker_id := OLD.worker_id;
  ELSE
    v_worker_id := NEW.worker_id;
  END IF;

  UPDATE public.workers
  SET
    rating_avg = COALESCE((
      SELECT ROUND(AVG(rating)::NUMERIC, 2)
      FROM public.reviews
      WHERE worker_id = v_worker_id
      AND reviewer_role = 'client'
      AND is_hidden = false
    ), 0.0),
    review_count = COALESCE((
      SELECT COUNT(*)::INTEGER
      FROM public.reviews
      WHERE worker_id = v_worker_id
      AND reviewer_role = 'client'
      AND is_hidden = false
    ), 0)
  WHERE id = v_worker_id;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER after_review_changed
  AFTER INSERT OR UPDATE OR DELETE ON public.reviews
  FOR EACH ROW EXECUTE FUNCTION public.sync_worker_review_stats();

-- 6. Analytics Functions

-- A. Get category average rating
CREATE OR REPLACE FUNCTION public.get_category_average_rating(p_category TEXT)
RETURNS NUMERIC AS $$
DECLARE
  v_avg_rating NUMERIC;
BEGIN
  SELECT AVG(r.rating)::NUMERIC INTO v_avg_rating
  FROM public.reviews r
  JOIN public.workers w ON r.worker_id = w.id
  WHERE w.category = p_category
  AND r.reviewer_role = 'client'
  AND r.is_hidden = false;
  
  RETURN COALESCE(ROUND(v_avg_rating, 2), 0.0);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- B. Get worker rank (returns category_rank and overall_rank)
CREATE OR REPLACE FUNCTION public.get_worker_ranking(p_worker_id UUID)
RETURNS TABLE (category_rank INTEGER, overall_rank INTEGER) AS $$
BEGIN
  RETURN QUERY
  WITH category_ranks AS (
    SELECT id,
           ROW_NUMBER() OVER (ORDER BY rating_avg DESC, review_count DESC, id ASC)::INTEGER as r_cat
    FROM public.workers
    WHERE category = (SELECT category FROM public.workers WHERE id = p_worker_id)
  ),
  overall_ranks AS (
    SELECT id,
           ROW_NUMBER() OVER (ORDER BY rating_avg DESC, review_count DESC, id ASC)::INTEGER as r_all
    FROM public.workers
  )
  SELECT cr.r_cat, or_all.r_all
  FROM public.workers w
  LEFT JOIN category_ranks cr ON cr.id = w.id
  LEFT JOIN overall_ranks or_all ON or_all.id = w.id
  WHERE w.id = p_worker_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. Row Level Security Policies

-- Select Reviews
CREATE POLICY "Reviews are viewable by everyone if not hidden, or participants/admins" 
ON public.reviews
FOR SELECT
USING (
  is_hidden = false OR
  auth.uid() = customer_id OR
  auth.uid() = worker_id OR
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() AND role = 'admin'
  )
);

-- Insert Reviews (Allow authenticated users to try inserting, let before-insert trigger check authorization details)
CREATE POLICY "Booking participants can write reviews"
ON public.reviews
FOR INSERT
WITH CHECK (
  auth.uid() = customer_id OR auth.uid() = worker_id
);

-- Update Reviews (Only admins can update)
CREATE POLICY "Admins can update reviews for moderation"
ON public.reviews
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() AND role = 'admin'
  )
);

-- Delete Reviews (Only admins can delete)
CREATE POLICY "Admins can delete reviews"
ON public.reviews
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() AND role = 'admin'
  )
);

-- RLS policies for review_tags
CREATE POLICY "Review tags are viewable by everyone if parent review is visible"
ON public.review_tags
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.reviews r
    WHERE r.id = review_id
  )
);

CREATE POLICY "Review participants can create review tags"
ON public.review_tags
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.reviews r
    WHERE r.id = review_id AND (auth.uid() = r.customer_id OR auth.uid() = r.worker_id)
  )
);

-- 8. Indexes for Optimization
CREATE INDEX idx_reviews_booking_role ON public.reviews(booking_id, reviewer_role);
CREATE INDEX idx_reviews_worker_hidden ON public.reviews(worker_id) WHERE is_hidden = false;
CREATE INDEX idx_reviews_customer ON public.reviews(customer_id);
CREATE INDEX idx_review_tags_parent ON public.review_tags(review_id);
