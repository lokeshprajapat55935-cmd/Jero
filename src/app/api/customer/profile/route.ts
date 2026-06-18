import { NextRequest } from 'next/server';
import { requireClient } from '@/lib/auth/server-guard';
import { z } from 'zod';

const updateProfileSchema = z.object({
  full_name: z.string().min(2).max(100).optional(),
  email: z.string().email().optional(),
  avatar_url: z.string().url().optional(),
  address: z.string().max(300).optional(),
});

export async function GET(request: NextRequest) {
  try {
    const { user, admin } = await requireClient();
    const userId = user.id;

    const { data: profile, error } = await admin
      .from('profiles')
      .select('id, full_name, email, phone, avatar_url, created_at, role, onboarded')
      .eq('id', userId)
      .maybeSingle();

    if (error) {
      console.error("Supabase profile fetch error:", error);
      return Response.json({ success: false, data: null, error: 'Failed to fetch profile' }, { status: 200 });
    }

    // Fetch address and KYC status from customers table
    const { data: customerData } = await admin
      .from('customers')
      .select('address, kyc_status')
      .eq('profile_id', userId)
      .maybeSingle();

    const extendedProfile = profile ? {
      ...profile,
      address: customerData?.address || '',
      kyc_status: customerData?.kyc_status || 'unverified',
      referral_code: `ZOLVO${userId.substring(0, 5).toUpperCase()}`
    } : { 
      id: userId, 
      full_name: 'Customer', 
      address: '',
      role: 'client', 
      kyc_status: 'unverified', 
      referral_code: `ZOLVO${userId.substring(0, 5).toUpperCase()}` 
    };

    return Response.json({ success: true, data: { profile: extendedProfile }, error: null }, { status: 200 });
  } catch (err) {
    console.error("Customer Profile API crash:", err);
    return Response.json({ success: false, data: null, error: 'Internal Server Error' }, { status: 200 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { user, admin } = await requireClient();
    const userId = user.id;

    const body = await request.json().catch(() => ({}));
    const validated = updateProfileSchema.safeParse(body);
    
    if (!validated.success) {
      return Response.json({ success: false, data: null, error: 'Validation failed', details: validated.error.flatten() }, { status: 400 });
    }
    
    const { full_name, email, avatar_url, address } = validated.data;
    
    const updates: Record<string, any> = {};
    if (full_name !== undefined) updates.full_name = full_name;
    if (email !== undefined) updates.email = email;
    if (avatar_url !== undefined) updates.avatar_url = avatar_url;
    
    const customerUpdates: Record<string, any> = {};
    if (full_name !== undefined) customerUpdates.full_name = full_name;
    if (address !== undefined) customerUpdates.address = address;
    
    if (Object.keys(updates).length === 0 && Object.keys(customerUpdates).length === 0) {
      return Response.json({ success: false, data: null, error: 'No valid fields to update' }, { status: 400 });
    }

    let updatedProfile = null;

    if (Object.keys(updates).length > 0) {
      updates.updated_at = new Date().toISOString();
      const { data, error } = await admin
        .from('profiles')
        .update(updates)
        .eq('id', userId)
        .select('id, full_name, email, phone, avatar_url, created_at, role, onboarded')
        .maybeSingle();

      if (error) {
        console.error("Supabase profile update error:", error);
        return Response.json({ success: false, data: null, error: 'Failed to update profile' }, { status: 200 });
      }
      updatedProfile = data;
    } else {
      const { data } = await admin
        .from('profiles')
        .select('id, full_name, email, phone, avatar_url, created_at, role, onboarded')
        .eq('id', userId)
        .maybeSingle();
      updatedProfile = data;
    }

    if (Object.keys(customerUpdates).length > 0) {
      customerUpdates.updated_at = new Date().toISOString();
      const { error: customerError } = await admin
        .from('customers')
        .update(customerUpdates)
        .eq('profile_id', userId);

      if (customerError) {
        console.error("Supabase customer update error:", customerError);
        return Response.json({ success: false, data: null, error: 'Failed to update customer details' }, { status: 200 });
      }
    }

    const { data: customerData } = await admin
      .from('customers')
      .select('address')
      .eq('profile_id', userId)
      .maybeSingle();

    const responseProfile = updatedProfile ? {
      ...updatedProfile,
      address: customerData?.address || ''
    } : null;

    return Response.json({ success: true, data: { profile: responseProfile }, error: null }, { status: 200 });
  } catch (err) {
    console.error("Customer Profile API crash:", err);
    return Response.json({ success: false, data: null, error: 'Internal Server Error' }, { status: 200 });
  }
}
