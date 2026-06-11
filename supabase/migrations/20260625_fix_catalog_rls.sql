-- Migration: 20260625_fix_catalog_rls.sql
-- Description: Break RLS circular recursion loops and optimize catalog query performance.

-- 1. Fix workers select policy to avoid querying profiles or bookings
DROP POLICY IF EXISTS "Workers viewable by self, admins, or clients with active bookings" ON public.workers;

CREATE POLICY "Workers viewable by self, admins, or clients with active bookings" ON public.workers
  FOR SELECT USING (
    auth.uid() = id OR
    status = 'approved'
  );

-- 2. Restrict admins manage catalog_services policy to write operations only
DROP POLICY IF EXISTS "Admins can manage catalog_services" ON public.catalog_services;

CREATE POLICY "Admins can manage catalog_services" ON public.catalog_services
  FOR INSERT, UPDATE, DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- 3. Restrict admins manage catalog_sub_services policy to write operations only
DROP POLICY IF EXISTS "Admins can manage catalog_sub_services" ON public.catalog_sub_services;

CREATE POLICY "Admins can manage catalog_sub_services" ON public.catalog_sub_services
  FOR INSERT, UPDATE, DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE id = auth.uid() AND role = 'admin'
    )
  );
