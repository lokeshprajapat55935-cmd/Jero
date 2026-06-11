const fs = require('fs');
const path = require('path');

const env = {};
for (const line of fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const i = line.indexOf('=');
  if (i === -1) continue;
  let val = line.slice(i + 1).trim();
  if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
  env[line.slice(0, i).trim()] = val;
}

const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;

const migrationPath = process.argv[2];
if (!migrationPath) {
  console.error('Usage: node scripts/apply_sql.js <migration_path>');
  process.exit(1);
}

const sql = fs.readFileSync(migrationPath, 'utf8');

async function run() {
  console.log(`Applying ${migrationPath}...`);
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
    console.error('Failed to apply migration:', await response.text());
    process.exit(1);
  }

  const result = await response.json();
  console.log('Success:', result);
}

run().catch(console.error);
