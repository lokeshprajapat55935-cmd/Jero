/**
 * apply-dispatch-fix.js
 * Applies the dispatch notification system fix migration to Supabase.
 *
 * Usage: node scripts/apply-dispatch-fix.js
 */

const fs = require('fs');
const path = require('path');

// Load env vars from .env.local
const envPath = path.join(__dirname, '..', '.env.local');
const envContent = fs.readFileSync(envPath, 'utf-8');
const env = {};
for (const line of envContent.split('\n')) {
  const [key, ...rest] = line.split('=');
  if (key && rest.length) env[key.trim()] = rest.join('=').trim();
}

const SUPABASE_URL = env['NEXT_PUBLIC_SUPABASE_URL'];
const SERVICE_ROLE_KEY = env['SUPABASE_SERVICE_ROLE_KEY'];

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('❌ Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

const migrationPath = path.join(__dirname, '..', 'supabase', 'migrations', '20260630_fix_dispatch_notification_system.sql');
const sql = fs.readFileSync(migrationPath, 'utf-8');

async function runMigration() {
  console.log('🚀 Applying migration: 20260630_fix_dispatch_notification_system.sql');
  console.log(`📡 Supabase URL: ${SUPABASE_URL}`);
  console.log('');

  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
      'apikey': SERVICE_ROLE_KEY,
    },
    body: JSON.stringify({ query: sql }),
  });

  if (!response.ok) {
    // Try the direct SQL execution endpoint
    const errText = await response.text();
    console.error('exec_sql RPC failed, trying direct approach...');
    console.error(errText);
    await runViaSqlApi(sql);
    return;
  }

  const result = await response.json();
  console.log('✅ Migration applied successfully:', result);
}

async function runViaSqlApi(sql) {
  // Split into individual statements and run each
  const statements = sql
    .split(/;\s*\n/)
    .map(s => s.trim())
    .filter(s => s.length > 0 && !s.startsWith('--'));

  console.log(`Running ${statements.length} SQL statements...`);

  for (let i = 0; i < statements.length; i++) {
    const stmt = statements[i] + ';';
    if (stmt.trim() === ';') continue;

    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
          'apikey': SERVICE_ROLE_KEY,
        },
        body: JSON.stringify({ query: stmt }),
      });

      const text = await res.text();
      if (!res.ok) {
        console.error(`❌ Statement ${i + 1} failed:`, text.substring(0, 200));
      } else {
        console.log(`✅ Statement ${i + 1}/${statements.length} OK`);
      }
    } catch (err) {
      console.error(`❌ Statement ${i + 1} threw:`, err.message);
    }
  }
}

runMigration().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
