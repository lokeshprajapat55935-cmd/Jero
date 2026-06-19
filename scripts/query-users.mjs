import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data: clients } = await supabase.from('profiles').select('*').eq('role', 'client').limit(1);
  const { data: workers } = await supabase.from('profiles').select('*, workers(*)').eq('role', 'worker').limit(1);
  
  console.log('Client:', JSON.stringify(clients?.[0], null, 2));
  console.log('Worker:', JSON.stringify(workers?.[0], null, 2));
}

run();
