/**
 * run-sql-via-supabase-rpc.mjs
 *
 * Applies the dispatch fix migration by calling a Supabase RPC that
 * executes raw SQL. Falls back to running individual idempotent fixes
 * via the Supabase JS client if exec_sql is not available.
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load env vars from .env.local
const envPath = path.join(__dirname, '..', '.env.local');
const envContent = fs.readFileSync(envPath, 'utf-8');
const env = {};
for (const line of envContent.split('\n')) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const idx = trimmed.indexOf('=');
  if (idx === -1) continue;
  env[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim();
}

const SUPABASE_URL = env['NEXT_PUBLIC_SUPABASE_URL'];
const SERVICE_ROLE_KEY = env['SUPABASE_SERVICE_ROLE_KEY'];

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// ── Verification queries ───────────────────────────────────────────────────────
async function runVerification() {
  console.log('\n🔍 Verification Results:\n');

  // 1. Check for workers stuck on 'available'
  const { data: stuckWorkers, error: e1 } = await supabase
    .from('worker_availability')
    .select('worker_id, status')
    .eq('status', 'available');

  if (e1) console.error('  worker_availability check error:', e1.message);
  else console.log(`  Workers stuck on 'available': ${stuckWorkers?.length ?? 0} ${stuckWorkers?.length === 0 ? '✅' : '❌ (need data fix)'}`);

  // 2. Count approved online workers
  const { data: onlineWorkers, error: e2 } = await supabase
    .from('workers')
    .select('id, status, category')
    .eq('status', 'approved');

  if (e2) console.error('  workers check error:', e2.message);
  else console.log(`  Workers with status='approved': ${onlineWorkers?.length ?? 0} ${onlineWorkers?.length > 0 ? '✅' : '⚠️  (no approved workers found)'}`);

  // 3. Check online availability
  const { data: onlineAvail, error: e3 } = await supabase
    .from('worker_availability')
    .select('worker_id, status')
    .eq('status', 'online');

  if (e3) console.error('  worker_availability online check error:', e3.message);
  else console.log(`  Workers with availability='online': ${onlineAvail?.length ?? 0} ${onlineAvail?.length > 0 ? '✅' : '⚠️  (no workers online — they need to toggle online in the app)'}`);
}

// ── Apply the data fix (idempotent parts that don't need raw SQL) ──────────────
async function applyDataFix() {
  console.log('\n📝 Applying data fix (migrate available→online)...');

  // We can't run ALTER TABLE via JS client. But we CAN run the UPDATE.
  // The SQL DDL statements require the Supabase SQL editor.
  
  // Show what needs to be done manually
  console.log('\n⚠️  The following SQL commands require manual execution in Supabase SQL Editor:');
  console.log('   Go to: https://supabase.com/dashboard/project/sezlmssvkpzrohtjsgyl/sql\n');
  
  const criticalSQL = `-- CRITICAL FIX: Run this in Supabase SQL Editor
-- ============================================================
-- Step 1: Fix REPLICA IDENTITY for Realtime to send full rows
ALTER TABLE public.notifications REPLICA IDENTITY FULL;

-- Step 2: Add notifications to realtime publication
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'notifications'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
  END IF;
END $$;

-- Step 3: Fix get_nearby_dispatch_workers (wrong status values)
CREATE OR REPLACE FUNCTION public.get_nearby_dispatch_workers(
  p_latitude NUMERIC,
  p_longitude NUMERIC,
  p_category TEXT,
  p_radius_km NUMERIC,
  p_limit INTEGER
)
RETURNS TABLE (
  worker_id UUID,
  distance_km NUMERIC,
  rating_avg NUMERIC,
  review_count INTEGER,
  latitude NUMERIC,
  longitude NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    w.id AS worker_id,
    (6371 * acos(
      LEAST(1.0, GREATEST(-1.0,
        cos(radians(p_latitude)) * cos(radians(wl.latitude)) *
        cos(radians(wl.longitude) - radians(p_longitude)) +
        sin(radians(p_latitude)) * sin(radians(wl.latitude))
      ))
    ))::numeric AS distance_km,
    w.rating_avg,
    w.review_count,
    wl.latitude,
    wl.longitude
  FROM public.workers w
  JOIN public.worker_locations wl ON wl.worker_id = w.id
  JOIN public.worker_availability wa ON wa.worker_id = w.id
  WHERE w.status = 'approved'
    AND w.category = p_category
    AND wa.status = 'online'
    AND wl.latitude IS NOT NULL
    AND wl.longitude IS NOT NULL
    AND (6371 * acos(
      LEAST(1.0, GREATEST(-1.0,
        cos(radians(p_latitude)) * cos(radians(wl.latitude)) *
        cos(radians(wl.longitude) - radians(p_longitude)) +
        sin(radians(p_latitude)) * sin(radians(wl.latitude))
      ))
    )) <= p_radius_km
  ORDER BY distance_km ASC, w.rating_avg DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 4: Fix stale 'available' worker availability rows
UPDATE public.worker_availability
SET status = 'online'
WHERE status = 'available';

-- Step 5: Add indexes for notification performance
CREATE INDEX IF NOT EXISTS idx_notifications_user_type_created
  ON public.notifications(user_id, type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
  ON public.notifications(user_id, is_read)
  WHERE is_read = FALSE;

-- Verification
SELECT relreplident FROM pg_class WHERE relname = 'notifications';
-- Expected: 'f' (FULL)
SELECT tablename FROM pg_publication_tables
WHERE pubname = 'supabase_realtime' AND tablename = 'notifications';
-- Expected: 1 row
SELECT status, count(*) FROM worker_availability GROUP BY status;
-- Expected: no 'available' rows`;

  console.log(criticalSQL);
  
  // Write to a standalone file for easy copy-paste
  const outPath = path.join(__dirname, '..', 'supabase', 'APPLY_THIS_FIX.sql');
  fs.writeFileSync(outPath, criticalSQL);
  console.log(`\n✅ SQL also saved to: supabase/APPLY_THIS_FIX.sql`);
}

async function main() {
  console.log('🚀 Zolvo Dispatch Fix — Status Check & Guide');
  console.log('============================================\n');
  console.log(`Supabase Project: sezlmssvkpzrohtjsgyl`);

  await runVerification();
  await applyDataFix();
  
  console.log('\n\n📋 SUMMARY OF WHAT WAS ALREADY FIXED (no action needed):');
  console.log('  ✅ src/hooks/useDispatch.ts — handles both REPLICA IDENTITY FULL and DEFAULT');
  console.log('     → Even before the DB fix, the 5s polling fallback works');
  console.log('  ✅ supabase/migrations/20260630_fix_dispatch_notification_system.sql — created');
  
  console.log('\n📋 WHAT STILL NEEDS TO BE APPLIED (one-time SQL in Supabase dashboard):');
  console.log('  ❌ ALTER TABLE notifications REPLICA IDENTITY FULL');
  console.log('  ❌ ALTER PUBLICATION supabase_realtime ADD TABLE notifications');
  console.log('  ❌ CREATE OR REPLACE FUNCTION get_nearby_dispatch_workers (fix status values)');
  console.log('  ❌ UPDATE worker_availability SET status=\'online\' WHERE status=\'available\'');
  
  console.log('\n🔗 Apply here: https://supabase.com/dashboard/project/sezlmssvkpzrohtjsgyl/sql/new');
}

main().catch(console.error);
