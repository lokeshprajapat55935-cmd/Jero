import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

// Parse .env.local
const envPath = 'c:/Users/lokeshkumar/my-app/zolvo-app/.env.local';
const envContent = fs.readFileSync(envPath, 'utf-8');
const env = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^\s*([^#=]+)\s*=\s*(.*)\s*$/);
  if (match) {
    env[match[1].trim()] = match[2].trim();
  }
});

const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: false
  }
});

function hashOtp(otp) {
  return crypto.createHash('sha256').update(otp.trim()).digest('hex');
}

async function verifyFix() {
  const workerId = '31a8d01f-cfef-4d89-8934-bdc12186d0f1';
  const otpCode = '1234';
  const otpHash = hashOtp(otpCode);

  console.log('Fetching a client profile...');
  const { data: clients, error: clientErr } = await supabase
    .from('profiles')
    .select('id')
    .eq('role', 'client')
    .limit(1);

  if (clientErr || !clients || clients.length === 0) {
    console.error('Failed to fetch a client profile:', clientErr);
    return;
  }
  const clientId = clients[0].id;
  console.log('Using Client ID:', clientId);

  console.log('\nCreating a test booking...');
  const { data: dispatchRes, error: dispatchErr } = await supabase.rpc('create_booking_dispatch', {
    p_client_id: clientId,
    p_category: 'Electrician',
    p_description: 'TEST COMPLETION FLOW AND OFFLINE WALLET DEMOTION',
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

  if (dispatchErr || !dispatchRes?.success) {
    console.error('Failed to create test booking:', dispatchErr, dispatchRes);
    return;
  }
  const bookingId = dispatchRes.booking_id;
  console.log('Created Booking ID:', bookingId);

  try {
    console.log('\nInitializing database states via exec_sql...');
    const initSql = `
      -- Disable user triggers temporarily to prepare database state
      ALTER TABLE public.bookings DISABLE TRIGGER USER;
      
      -- Assign worker, set status, and set charges
      UPDATE public.bookings
      SET worker_id = '${workerId}',
          status = 'work_completed_pending_otp',
          commission_deducted = FALSE,
          payment_status = 'pending',
          service_charge = 250.00,
          updated_at = NOW()
      WHERE id = '${bookingId}';

      -- Setup active bookings record
      DELETE FROM public.active_bookings WHERE booking_id = '${bookingId}';
      INSERT INTO public.active_bookings (booking_id, worker_id, client_id, status)
      VALUES ('${bookingId}', '${workerId}', '${clientId}', 'work_completed_pending_otp');

      -- Set worker availability to busy on this booking
      UPDATE public.worker_availability
      SET status = 'busy',
          current_booking_id = '${bookingId}',
          last_active_at = NOW()
      WHERE worker_id = '${workerId}';

      -- Set worker wallet balance to 475 INR (below 500 INR limit)
      UPDATE public.worker_wallets
      SET balance = 475.00,
          updated_at = NOW()
      WHERE worker_id = '${workerId}';

      ALTER TABLE public.bookings ENABLE TRIGGER USER;
    `;

    const sqlRes = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseKey}`,
        'apikey': supabaseKey,
      },
      body: JSON.stringify({ query: initSql }),
    });

    if (!sqlRes.ok) {
      console.error('Failed to run initSql:', await sqlRes.text());
      return;
    }
    console.log('Database state initialized successfully.');

    console.log('\n--- Initial State ---');
    const { data: initBooking } = await supabase.from('bookings').select('status, payment_status, commission_deducted, commission_amount').eq('id', bookingId).single();
    console.log('Booking:', initBooking);
    const { data: initAvail } = await supabase.from('worker_availability').select('status, current_booking_id').eq('worker_id', workerId).single();
    console.log('Worker availability:', initAvail);
    const { data: initActive } = await supabase.from('active_bookings').select('*').eq('booking_id', bookingId);
    console.log('Active bookings count for this job:', initActive?.length);
    const { data: initWallet } = await supabase.from('worker_wallets').select('balance').eq('worker_id', workerId).single();
    console.log('Worker wallet balance:', initWallet?.balance);

    console.log('\nInserting completion OTP...');
    const { error: otpErr } = await supabase
      .from('booking_completion_otps')
      .insert({
        booking_id: bookingId,
        otp_hash: otpHash,
        expires_at: new Date(Date.now() + 600000).toISOString(),
        attempts: 0
      });

    if (otpErr) {
      console.error('OTP insert failed:', otpErr);
      return;
    }

    console.log('\nCalling verify_completion_otp RPC...');
    const { data: rpcRes, error: rpcErr } = await supabase
      .rpc('verify_completion_otp', {
        p_booking_id: bookingId,
        p_otp_hash: otpHash,
        p_worker_id: workerId
      });

    if (rpcErr) {
      console.error('RPC failed:', rpcErr);
    } else {
      console.log('RPC response:', rpcRes);
    }

    console.log('\n--- Final State ---');
    const { data: finalBooking } = await supabase.from('bookings').select('status, payment_status, commission_deducted, commission_amount').eq('id', bookingId).single();
    console.log('Booking:', finalBooking);
    const { data: finalAvail } = await supabase.from('worker_availability').select('status, current_booking_id').eq('worker_id', workerId).single();
    console.log('Worker availability:', finalAvail);
    const { data: finalActive } = await supabase.from('active_bookings').select('*').eq('booking_id', bookingId);
    console.log('Active bookings count for this job:', finalActive?.length);
    const { data: finalWallet } = await supabase.from('worker_wallets').select('balance').eq('worker_id', workerId).single();
    console.log('Worker wallet balance:', finalWallet?.balance);

  } finally {
    console.log('\nCleaning up test booking records...');
    await supabase.from('booking_completion_otps').delete().eq('booking_id', bookingId);
    await supabase.from('active_bookings').delete().eq('booking_id', bookingId);
    await supabase.from('bookings').delete().eq('id', bookingId);
    console.log('Clean up done.');
  }
}

verifyFix();
