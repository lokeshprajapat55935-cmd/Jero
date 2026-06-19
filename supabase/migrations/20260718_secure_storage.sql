-- ==============================================================================
-- Migration: Secure Storage Hardening
-- Description: Makes worker-documents and booking-images buckets private,
--              enforces strict RLS policies, and prevents public file enumeration.
-- ==============================================================================

-- 1. Update existing buckets to be private
UPDATE storage.buckets
SET public = false
WHERE id IN ('worker-documents', 'booking-images');

-- 2. Clean up old insecure policies
DROP POLICY IF EXISTS "Allow public read access to worker documents" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated upload to own folder" ON storage.objects;
DROP POLICY IF EXISTS "Public read booking images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated clients upload booking images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users upload booking images" ON storage.objects;
DROP POLICY IF EXISTS "Users delete own booking images" ON storage.objects;

-- 3. Restrictive Policies for 'worker-documents'
-- Workers can read/insert their own files. Admins can read all files.
CREATE POLICY "Worker Documents: Read Access" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'worker-documents'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
    )
  );

CREATE POLICY "Worker Documents: Insert Access" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'worker-documents' 
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Worker Documents: Update Access" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'worker-documents' 
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- 4. Restrictive Policies for 'booking-images'
-- Any authenticated user can read them (they are named with unguessable UUIDs).
-- Only the uploader can insert/update them.
CREATE POLICY "Booking Images: Read Access" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'booking-images'
    AND auth.role() = 'authenticated'
  );

CREATE POLICY "Booking Images: Insert Access" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'booking-images'
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Booking Images: Delete Access" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'booking-images'
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
