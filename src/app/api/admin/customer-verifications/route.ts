import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/supabase-server';
import { requireAdmin } from '@/lib/auth/admin';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const gate = await requireAdmin(supabase);
    if (!gate.ok) return NextResponse.json({ success: false, data: null, error: gate.message }, { status: gate.status });

    const admin = createAdminClient();
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
    const supabase = await createClient();
    const gate = await requireAdmin(supabase);
    if (!gate.ok) return NextResponse.json({ success: false, data: null, error: gate.message }, { status: gate.status });

    const admin = createAdminClient();

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

    const ipAddress = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown';
    await admin.rpc('log_admin_action', {
      p_admin_id: gate.user.id,
      p_action_type: `kyc_verification_${status}`,
      p_target_type: 'customer',
      p_target_id: data.profile_id,
      p_target_name: `Customer KYC ${data.profile_id}`,
      p_old_value: null,
      p_new_value: { status },
      p_reason: notes || `KYC Verification marked as ${status}`,
      p_ip_address: ipAddress
    });

    return Response.json({ success: true, data }, { status: 200 });
  } catch (err) {
    console.error("Admin Verifications PATCH crash:", err);
    return Response.json({ success: false, data: null, error: 'Internal Server Error' }, { status: 500 });
  }
}
