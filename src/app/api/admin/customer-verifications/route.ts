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

    // Verify admin role
    const { data: profile } = await admin.from('profiles').select('role').eq('id', userId).single();
    if (profile?.role !== 'admin') {
      return Response.json({ success: false, data: null, error: 'Forbidden' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status'); // pending, approved, rejected
    
    let query = admin
      .from('customer_verifications')
      .select(`
        *,
        profiles:profile_id (
          phone,
          email
        )
      `)
      .order('created_at', { ascending: false });

    if (status && status !== 'all') {
      query = query.eq('status', status);
    }

    const { data, error } = await query;

    if (error) {
      console.error("Admin fetch customer verifications error:", error);
      return Response.json({ success: false, data: null, error: 'Failed to fetch verifications' }, { status: 500 });
    }

    return Response.json({ success: true, data }, { status: 200 });
  } catch (err) {
    console.error("Admin Verifications GET crash:", err);
    return Response.json({ success: false, data: null, error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const admin = createAdminClient();
    const userId = await getAuthUserId(request, admin);
    
    if (!userId) {
      return Response.json({ success: false, data: null, error: 'Unauthorized' }, { status: 401 });
    }

    // Verify admin role
    const { data: profile } = await admin.from('profiles').select('role').eq('id', userId).single();
    if (profile?.role !== 'admin') {
      return Response.json({ success: false, data: null, error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json().catch(() => null);
    if (!body || !body.id || !body.status) {
      return Response.json({ success: false, data: null, error: 'Missing required fields (id, status)' }, { status: 400 });
    }

    const { id, status, notes } = body;

    if (!['approved', 'rejected'].includes(status)) {
      return Response.json({ success: false, data: null, error: 'Invalid status' }, { status: 400 });
    }

    // Update the verification record
    const { data, error } = await admin
      .from('customer_verifications')
      .update({
        status,
        verification_notes: notes || null,
        verified_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error("Admin update customer verification error:", error);
      return Response.json({ success: false, data: null, error: 'Failed to update verification' }, { status: 500 });
    }

    // Sync status to customers table
    // If approved -> 'verified', if rejected -> 'rejected'
    const customerKycStatus = status === 'approved' ? 'verified' : 'rejected';
    
    await admin
      .from('customers')
      .update({ kyc_status: customerKycStatus })
      .eq('profile_id', data.profile_id);

    return Response.json({ success: true, data }, { status: 200 });
  } catch (err) {
    console.error("Admin Verifications PATCH crash:", err);
    return Response.json({ success: false, data: null, error: 'Internal Server Error' }, { status: 500 });
  }
}
