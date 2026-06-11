import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const env = {};
fs.readFileSync(path.join(__dirname,'../.env.local'),'utf-8').split('\n').forEach(l=>{const i=l.indexOf('=');if(i>0)env[l.slice(0,i).trim()]=l.slice(i+1).trim();});
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {auth:{persistSession:false}});

async function main() {
  // 1. Client profiles
  const { data: profiles, error: pe } = await supabase.from('profiles').select('id, role, full_name').eq('role','client').limit(5);
  console.log('CLIENT PROFILES:', JSON.stringify(profiles), 'ERR:', pe?.message);

  // 2. Clients table
  const { data: clients, error: ce } = await supabase.from('clients').select('id, profile_id').limit(5);
  console.log('CLIENTS TABLE:', JSON.stringify(clients), 'ERR:', ce?.message);

  // 3. Existing bookings
  const { data: bookings, error: be } = await supabase.from('bookings').select('id, client_id, status').limit(3);
  console.log('EXISTING BOOKINGS:', JSON.stringify(bookings), 'ERR:', be?.message);

  // 4. Are client profile IDs in clients table?
  if (profiles && profiles.length > 0) {
    const pid = profiles[0].id;
    console.log('Checking if profile', pid, 'is in clients table...');
    const {data: cRow} = await supabase.from('clients').select('id').eq('id', pid).maybeSingle();
    console.log('In clients table:', JSON.stringify(cRow));
    
    // Try RPC with real profile ID
    console.log('Testing RPC with real profile id as client...');
    const r = await supabase.rpc('create_booking_dispatch', {
      p_client_id: pid,
      p_category: 'Electrician',
      p_description: 'TEST BOOKING PLEASE DELETE',
      p_location_address: 'Bhilwara Rajasthan',
      p_latitude: 25.3478,
      p_longitude: 74.6381,
      p_area_id: null,
      p_payment_method: 'cash',
      p_ip_address: '127.0.0.1',
      p_user_agent: 'test',
      p_booking_type: 'asap',
      p_scheduled_for: null,
      p_scheduled_date: null,
      p_scheduled_time_slot: 'asap',
      p_image_urls: [],
    });
    console.log('RPC with profile id:', JSON.stringify({data: r.data, error: r.error}));
  }

  // 5. Try RPC with a real client id
  if (clients && clients.length > 0) {
    const cid = clients[0].id;
    console.log('Testing RPC with real clients.id:', cid);
    const r = await supabase.rpc('create_booking_dispatch', {
      p_client_id: cid,
      p_category: 'Electrician',
      p_description: 'TEST BOOKING PLEASE DELETE',
      p_location_address: 'Bhilwara Rajasthan',
      p_latitude: 25.3478,
      p_longitude: 74.6381,
      p_area_id: null,
      p_payment_method: 'cash',
      p_ip_address: '127.0.0.1',
      p_user_agent: 'test',
      p_booking_type: 'asap',
      p_scheduled_for: null,
      p_scheduled_date: null,
      p_scheduled_time_slot: 'asap',
      p_image_urls: [],
    });
    console.log('RPC with clients.id:', JSON.stringify({data: r.data, error: r.error}));

    // Delete any test booking created
    if (r.data?.success && r.data?.booking_id && r.data?.status !== 'duplicate') {
      await supabase.from('bookings').delete().eq('id', r.data.booking_id);
      console.log('Cleaned up test booking');
    }
  }
}
main().catch(e=>console.error('FATAL:',e.message));
