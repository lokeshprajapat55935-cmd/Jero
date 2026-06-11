/**
 * Supabase Database Schema - Phase 3 Part 7: Reviews & Ratings System
 */

-- Create Reviews table
CREATE TABLE IF NOT EXISTS public.reviews (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  booking_id UUID REFERENCES public.bookings(id) ON DELETE CASCADE NOT NULL,
  reviewer_id UUID REFERENCES public.profiles(id) NOT NULL,
  worker_id UUID REFERENCES public.workers(id) NOT NULL,
  rating INTEGER CHECK (rating >= 1 AND rating <= 5) NOT NULL,
  comment TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  -- Ensure only one review per booking
  CONSTRAINT unique_booking_review UNIQUE(booking_id)
);

-- Enable RLS
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Reviews are viewable by everyone" ON public.reviews
  FOR SELECT USING (true);

CREATE POLICY "Clients can create reviews for their completed bookings" ON public.reviews
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.bookings b 
      WHERE b.id = booking_id 
      AND b.client_id = auth.uid() 
      AND b.status = 'completed'
    )
  );

-- Update Workers table to include cached rating metrics
ALTER TABLE public.workers ADD COLUMN IF NOT EXISTS rating_avg NUMERIC DEFAULT 0;
ALTER TABLE public.workers ADD COLUMN IF NOT EXISTS review_count INTEGER DEFAULT 0;

-- Function to update worker rating metrics
CREATE OR REPLACE FUNCTION public.update_worker_rating()
RETURNS TRIGGER AS $$
DECLARE
  target_worker_id UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN
    target_worker_id := OLD.worker_id;
  ELSE
    target_worker_id := NEW.worker_id;
  END IF;

  UPDATE public.workers
  SET 
    rating_avg = COALESCE((
      SELECT AVG(rating)::NUMERIC(3,2) 
      FROM public.reviews 
      WHERE worker_id = target_worker_id
    ), 0),
    review_count = (
      SELECT COUNT(*) 
      FROM public.reviews 
      WHERE worker_id = target_worker_id
    )
  WHERE id = target_worker_id;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update worker ratings on review insert/update/delete
CREATE TRIGGER on_review_changed
  AFTER INSERT OR UPDATE OR DELETE ON public.reviews
  FOR EACH ROW EXECUTE FUNCTION public.update_worker_rating();

-- Indexes
CREATE INDEX idx_reviews_worker ON public.reviews(worker_id);
CREATE INDEX idx_reviews_booking ON public.reviews(booking_id);
