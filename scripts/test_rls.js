import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !anonKey) {
  console.error("Missing supabase credentials");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, anonKey);

async function simulateAttacks() {
  console.log("Starting Simulated RLS Attacks...");
  
  // Attack 1: Try reading other users' data anonymously
  console.log("\n[ATTACK 1] Anonymous accessing customer records");
  const { data: clients, error: err1 } = await supabase.from('clients').select('*');
  console.log(err1 ? `Error: ${err1.message}` : `Blocked by RLS? Retrieved count: ${clients?.length} (Should be 0)`);

  // Attack 2: Anonymous modifying a booking status directly
  console.log("\n[ATTACK 2] Anonymous updating booking status");
  const { error: err2 } = await supabase.from('bookings').update({ status: 'completed' }).eq('id', '11111111-1111-1111-1111-111111111111');
  console.log(err2 ? `Error: ${err2.message}` : "Failed to block! Update succeeded or no rows affected.");

  console.log("\nSimulations completed.");
  process.exit(0);
}

simulateAttacks();
