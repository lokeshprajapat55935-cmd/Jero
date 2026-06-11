-- Backup Script: 20260603_sync_backup.sql
-- Description: Creates temporary backup snapshots of core tables before applying the synchronization triggers.
-- Run this query in your Supabase SQL Editor to secure your current data.

-- 1. Backup Workers
DROP TABLE IF EXISTS public.backup_workers;
CREATE TABLE public.backup_workers AS 
SELECT * FROM public.workers;

-- 2. Backup Clients
DROP TABLE IF EXISTS public.backup_clients;
CREATE TABLE public.backup_clients AS 
SELECT * FROM public.clients;

-- 3. Backup Partners
DROP TABLE IF EXISTS public.backup_partners;
CREATE TABLE public.backup_partners AS 
SELECT * FROM public.partners;

-- 4. Backup Customers
DROP TABLE IF EXISTS public.backup_customers;
CREATE TABLE public.backup_customers AS 
SELECT * FROM public.customers;

-- 5. Notify backup success
SELECT 'Backup completed successfully!' as status, 
       (SELECT COUNT(*) FROM public.backup_workers) as backup_workers_count,
       (SELECT COUNT(*) FROM public.backup_clients) as backup_clients_count,
       (SELECT COUNT(*) FROM public.backup_partners) as backup_partners_count,
       (SELECT COUNT(*) FROM public.backup_customers) as backup_customers_count;
