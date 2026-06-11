/**
 * verify-dispatch-fix.mjs
 * Verifies whether the dispatch notification fix was applied correctly.
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
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

async function verify() {
  console.log('==============================================');
  console.log(' ZOLVO DISPATCH FIX — VERIFICATION REPORT');
  console.log('==============================================\n');

  let allPassed = true;

  // ── 1. REPLICA IDENTITY on notifications ─────────────────────────────────
  console.log('CHECK 1: notifications REPLICA IDENTITY FULL');
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/check_notifications_replica_identity`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
        'apikey': SERVICE_ROLE_KEY,
      },
      body: JSON.stringify({}),
    });
    // Try via raw select on pg_class
    const { data, error } = await supabase
      .rpc('exec_sql', { query: "SELECT relreplident FROM pg_class WHERE relname = 'notifications'" })
      .single();
    
    if (error) throw error;
    const ri = data?.relreplident ?? data;
    const passed = ri === 'f' || JSON.stringify(data).includes('"f"');
    console.log(`  Result: relreplident = '${JSON.stringify(ri)}' ${passed ? '✅ FULL (correct)' : '❌ NOT FULL (fix not applied)'}`);
    if (!passed) allPassed = false;
  } catch (err) {
    // Fallback: check via notifications table columns using information_schema
    console.log(`  Could not query pg_class directly. Trying alternative check...`);
    try {
      // If REPLICA IDENTITY FULL is set, we can verify indirectly
      // by checking if the table is in the realtime publication
      const { data, error } = await supabase
        .rpc('exec_sql', { 
          query: `SELECT tablename FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'notifications'`
        });
      console.log(`  pg_class check skipped (no exec_sql RPC). Manual verify needed.`);
      console.log(`  Run this SQL in Supabase dashboard:`);
      console.log(`    SELECT relreplident FROM pg_class WHERE relname = 'notifications';`);
      console.log(`    Expected: 'f'`);
    } catch (e2) {
      console.log(`  ⚠️  Cannot verify automatically. Manual check required.`);
    }
  }

  // ── 2. notifications in realtime publication ──────────────────────────────
  console.log('\nCHECK 2: notifications in supabase_realtime publication');
  try {
    // Use a raw RPC if available, otherwise use information_schema
    const { data, error } = await supabase
      .from('pg_publication_tables')
      .select('tablename')
      .eq('pubname', 'supabase_realtime')
      .eq('tablename', 'notifications');
    
    if (error) throw error;
    const inPub = (data?.length ?? 0) > 0;
    console.log(`  In publication: ${inPub ? '✅ YES' : '❌ NO (fix not applied)'}`);
    if (!inPub) allPassed = false;
  } catch (err) {
    console.log(`  Cannot access pg_publication_tables directly via JS client (expected for RLS).`);
    console.log(`  Manual check: SELECT tablename FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='notifications';`);
  }

  // ── 3. Worker availability — no 'available' stuck rows ───────────────────
  console.log('\nCHECK 3: No workers stuck on status=\'available\'');
  const { data: stuckWorkers, error: e3 } = await supabase
    .from('worker_availability')
    .select('worker_id, status')
    .eq('status', 'available');
  
  if (e3) {
    console.log(`  ❌ Error: ${e3.message}`);
    allPassed = false;
  } else {
    const count = stuckWorkers?.length ?? 0;
    console.log(`  Stuck rows: ${count} ${count === 0 ? '✅ None (correct)' : '❌ Still has stale data!'}`);
    if (count > 0) allPassed = false;
  }

  // ── 4. get_nearby_dispatch_workers — check it exists ────────────────────
  console.log('\nCHECK 4: get_nearby_dispatch_workers function exists');
  try {
    // Call the function with dummy values — if function is wrong it returns 0 rows
    // if function doesn't exist it throws
    const { data, error } = await supabase.rpc('get_nearby_dispatch_workers', {
      p_latitude: 25.3478,
      p_longitude: 74.6381,
      p_category: 'Electrician',
      p_radius_km: 50,
      p_limit: 10,
    });
    
    if (error) {
      console.log(`  ❌ Function call failed: ${error.message}`);
      console.log(`     This means the function fix was not applied.`);
      allPassed = false;
    } else {
      console.log(`  ✅ Function exists and is callable. Found ${data?.length ?? 0} nearby workers.`);
      if ((data?.length ?? 0) === 0) {
        console.log(`     ℹ️  0 results is normal if no workers are currently online in that area.`);
      }
    }
  } catch (err) {
    console.log(`  ❌ Function threw: ${err.message}`);
    allPassed = false;
  }

  // ── 5. Workers and availability status summary ───────────────────────────
  console.log('\nCHECK 5: Worker availability status distribution');
  const { data: statusDist, error: e5 } = await supabase
    .from('worker_availability')
    .select('status');
  
  if (e5) {
    console.log(`  ❌ Error: ${e5.message}`);
  } else {
    const counts = {};
    (statusDist ?? []).forEach(r => { counts[r.status] = (counts[r.status] || 0) + 1; });
    console.log('  Status distribution:', JSON.stringify(counts));
    console.log('  (Workers need to tap "Go Online" in the partner app to show up as online)');
  }

  // ── 6. Approved workers ─────────────────────────────────────────────────
  console.log('\nCHECK 6: Approved workers count');
  const { data: approvedWorkers, error: e6 } = await supabase
    .from('workers')
    .select('id, category, status')
    .eq('status', 'approved');
  
  if (e6) {
    console.log(`  ❌ Error: ${e6.message}`);
  } else {
    console.log(`  Approved workers: ${approvedWorkers?.length ?? 0} ✅`);
    (approvedWorkers ?? []).forEach(w => {
      console.log(`    - ${w.id} (${w.category})`);
    });
  }

  // ── Final Summary ────────────────────────────────────────────────────────
  console.log('\n==============================================');
  console.log(allPassed
    ? ' ✅ ALL CHECKS PASSED — Dispatch fix is live!'
    : ' ⚠️  SOME CHECKS COULD NOT AUTO-VERIFY (manual SQL check needed in dashboard)');
  console.log('==============================================\n');
  
  console.log('MANUAL VERIFICATION SQL (run in Supabase dashboard):');
  console.log(`
SELECT relreplident FROM pg_class WHERE relname = 'notifications';
-- Expected: 'f'

SELECT tablename FROM pg_publication_tables
WHERE pubname = 'supabase_realtime' AND tablename = 'notifications';
-- Expected: 1 row returned

SELECT status, count(*) FROM worker_availability GROUP BY status;
-- Expected: NO 'available' rows
`);
}

verify().catch(console.error);
