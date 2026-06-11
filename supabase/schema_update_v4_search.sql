/**
 * Supabase Database Schema - Search & Discovery Indexes
 */

-- Create indexes for text search if not present
-- Note: ilike queries are inefficient for large datasets; we should use tsvector for production search.

-- Add tsvector column for full-text search
ALTER TABLE public.workers ADD COLUMN IF NOT EXISTS search_vector tsvector;

-- Update function to refresh search vector
CREATE OR REPLACE FUNCTION public.worker_search_trigger() RETURNS trigger AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('english', COALESCE(NEW.category, '')), 'A') ||
    setweight(to_tsvector('english', COALESCE(NEW.bio, '')), 'B');
  RETURN NEW;
END
$$ LANGUAGE plpgsql;

-- Apply trigger
DROP TRIGGER IF EXISTS worker_search_update ON public.workers;
CREATE TRIGGER worker_search_update BEFORE INSERT OR UPDATE
ON public.workers FOR EACH ROW EXECUTE FUNCTION public.worker_search_trigger();

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_workers_search_vector ON public.workers USING GIN(search_vector);
CREATE INDEX IF NOT EXISTS idx_workers_rating ON public.workers(rating_avg DESC);
CREATE INDEX IF NOT EXISTS idx_workers_status ON public.workers(status);
