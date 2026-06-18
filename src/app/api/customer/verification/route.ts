import { NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAuthUserId } from '@/lib/api-utils';

export async function GET(request: NextRequest) {
  try {
    const admin = createAdminClient();
    const userId = await getAuthUserId(request, admin);
    
    if (!userId) {
      return Response.json({ success: false, data: null, error: 'Unauthorized' }, { status: 401 });
    }

    const { data, error } = await admin
      .from('customer_verifications')
      .select('*')
      .eq('profile_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error("Supabase verification fetch error:", error);
      return Response.json({ success: false, data: null, error: 'Failed to fetch verification status' }, { status: 500 });
    }

    return Response.json({ success: true, data }, { status: 200 });
  } catch (err) {
    console.error("Customer Verification API GET crash:", err);
    return Response.json({ success: false, data: null, error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const admin = createAdminClient();
    const userId = await getAuthUserId(request, admin);
    
    if (!userId) {
      return Response.json({ success: false, data: null, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    if (!body) {
      return Response.json({ success: false, data: null, error: 'Invalid request body' }, { status: 400 });
    }

    const { full_name, dob, gender } = body;

    if (!full_name || !dob || !gender) {
      return Response.json({ success: false, data: null, error: 'Missing required fields' }, { status: 400 });
    }

    // 1. Check if an existing pending verification exists
    const { data: existing } = await admin
      .from('customer_verifications')
      .select('id, status')
      .eq('profile_id', userId)
      .maybeSingle();

    if (existing?.status === 'pending') {
      return Response.json({ success: false, data: null, error: 'Verification is already pending review' }, { status: 400 });
    }

    // 2. Upsert verification record
    const { data, error } = await admin
      .from('customer_verifications')
      .upsert({
        id: existing?.id, // updates if exists, inserts if not
        profile_id: userId,
        full_name,
        dob,
        gender,
        status: 'pending',
        updated_at: new Date().toISOString()
      }, { onConflict: 'profile_id' })
      .select()
      .single();

    if (error) {
      console.error("Supabase verification insert error:", error);
      return Response.json({ success: false, data: null, error: 'Failed to submit verification' }, { status: 500 });
    }

    // 3. Update customer kyc_status to pending
    const { error: customerError } = await admin
      .from('customers')
      .update({ kyc_status: 'pending' })
      .eq('profile_id', userId);

    if (customerError) {
      console.error("Supabase customer status update error:", customerError);
      // We don't fail the whole request, but it's an anomaly.
    }

    return Response.json({ success: true, data }, { status: 200 });
  } catch (err) {
    console.error("Customer Verification API POST crash:", err);
    return Response.json({ success: false, data: null, error: 'Internal Server Error' }, { status: 500 });
  }
}
