import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const env = {};
fs.readFileSync(path.join(__dirname,'../.env.local'),'utf-8').split('\n').forEach(l=>{const i=l.indexOf('=');if(i>0)env[l.slice(0,i).trim()]=l.slice(i+1).trim();});
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {auth:{persistSession:false}});

async function main() {
  // 1. Get workers table columns
  const { data: wCols, error: we } = await supabase
    .from('workers')
    .select('*')
    .limit(1);
  if (wCols && wCols.length > 0) {
    console.log('WORKERS COLUMNS:', Object.keys(wCols[0]).join(', '));
    console.log('WORKERS SAMPLE:', JSON.stringify(wCols[0]));
  }
  if (we) console.log('WORKERS ERROR:', we.message);

  // 2. Get clients table columns
  const { data: cCols, error: ce } = await supabase
    .from('clients')
    .select('*')
    .limit(1);
  if (cCols && cCols.length > 0) {
    console.log('CLIENTS COLUMNS:', Object.keys(cCols[0]).join(', '));
  } else {
    console.log('CLIENTS TABLE: empty or error -', ce?.message);
  }

  // 3. Get worker_availability columns
  const { data: waCols } = await supabase.from('worker_availability').select('*').limit(1);
  if (waCols && waCols.length > 0) console.log('WORKER_AVAILABILITY COLUMNS:', Object.keys(waCols[0]).join(', '));

  // 4. Get bookings table columns
  const { data: bCols } = await supabase.from('bookings').select('*').limit(1);
  if (bCols && bCols.length > 0) console.log('BOOKINGS COLUMNS:', Object.keys(bCols[0]).join(', '));

  // 5. Get worker_locations columns
  const { data: wlCols } = await supabase.from('worker_locations').select('*').limit(1);
  if (wlCols && wlCols.length > 0) console.log('WORKER_LOCATIONS COLUMNS:', Object.keys(wlCols[0]).join(', '));

  // 6. Check notify_nearby_workers signature by testing it
  const { data: nnw, error: nnwe } = await supabase.rpc('notify_nearby_workers', {
    p_booking_id: '00000000-0000-0000-0000-000000000001',
    p_category: 'Electrician',
    p_city_id: '00000000-0000-0000-0000-000000000001',
    p_latitude: 25.3478,
    p_longitude: 74.6381,
    p_radius_km: 5.0,
    p_limit: 1,
  });
  console.log('notify_nearby_workers test (expect FK error not column error):', JSON.stringify({data: nnw, error: nnwe?.message}));

  // 7. Get cities table
  const { data: cities } = await supabase.from('cities').select('id, name, slug, is_active').limit(5);
  console.log('CITIES:', JSON.stringify(cities));

  // 8. Check actual workers with city info
  const { data: workers } = await supabase.from('workers').select('id, status, category, city_id, area_id').limit(5);
  console.log('WORKERS WITH CITY:', JSON.stringify(workers));
}
main().catch(e=>console.error('FATAL:',e.message));
