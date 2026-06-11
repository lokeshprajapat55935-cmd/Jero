/**
 * Phase 4: Production Database Optimization & Indexing
 */

-- Workers: Add indexes for category and status filtering
CREATE INDEX IF NOT EXISTS idx_workers_category_status ON public.workers(category, status);
CREATE INDEX IF NOT EXISTS idx_workers_rating_avg ON public.workers(rating_avg DESC);

-- Bookings: Add indexes for status filtering and time-based queries
CREATE INDEX IF NOT EXISTS idx_bookings_status_scheduled ON public.bookings(status, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_bookings_created_at ON public.bookings(created_at DESC);

-- Reviews: Add index for worker performance aggregation
CREATE INDEX IF NOT EXISTS idx_reviews_worker_rating ON public.reviews(worker_id, rating);

-- Conversations: Ensure efficient sorting for chat list
CREATE INDEX IF NOT EXISTS idx_conversations_last_message ON public.conversations(last_message_at DESC);

-- Messages: Ensure efficient history loading
CREATE INDEX IF NOT EXISTS idx_messages_conversation_id_created_at ON public.messages(conversation_id, created_at ASC);
