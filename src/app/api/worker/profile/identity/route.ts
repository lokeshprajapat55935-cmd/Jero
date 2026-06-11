import { createClient } from '@/lib/supabase/supabase-server';
import { createResponse, createErrorResponse, handleApiError, getAuthUserId } from '@/lib/api-utils';
import { createAdminClient } from '@/lib/supabase/admin';
import { z } from 'zod';

const identitySchema = z.object({
  aadhaar_number: z.string().optional(),
  pan_number: z.string().optional(),
  id_proof_type: z.string().optional(),
  id_proof_url: z.string().url().optional().or(z.literal('')),
});

export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const userId = await getAuthUserId(request as any, supabase);
    if (!userId) return createErrorResponse('Unauthorized', 401);

    const admin = createAdminClient();

    // Get partner record
    const { data: partner, error: partnerError } = await admin
      .from('partners')
      .select('full_name, aadhaar_number, pan_number, id_proof_type, id_proof_url, status')
      .eq('profile_id', userId)
      .maybeSingle();

    if (partnerError) throw partnerError;

    // Get profile for phone
    const { data: profile, error: profileError } = await admin
      .from('profiles')
      .select('phone, full_name')
      .eq('id', userId)
      .maybeSingle();

    if (profileError) throw profileError;

    return createResponse({
      full_name: partner?.full_name || profile?.full_name || '',
      phone: profile?.phone || '',
      aadhaar_number: partner?.aadhaar_number || '',
      pan_number: partner?.pan_number || '',
      id_proof_type: partner?.id_proof_type || 'Aadhaar',
      id_proof_url: partner?.id_proof_url || '',
      kyc_status: partner?.status || 'pending',
      is_approved: partner?.status === 'approved',
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const supabase = await createClient();
    const userId = await getAuthUserId(request as any, supabase);
    if (!userId) return createErrorResponse('Unauthorized', 401);

    const admin = createAdminClient();

    // Check approval status — approved workers cannot update identity
    const { data: partner } = await admin
      .from('partners')
      .select('status')
      .eq('profile_id', userId)
      .maybeSingle();

    if (partner?.status === 'approved') {
      return createErrorResponse('Approved partners cannot modify identity documents.', 403);
    }

    const body = await request.json();
    const validated = identitySchema.parse(body);

    const { data, error } = await admin
      .from('partners')
      .update({
        aadhaar_number: validated.aadhaar_number,
        pan_number: validated.pan_number,
        id_proof_type: validated.id_proof_type,
        id_proof_url: validated.id_proof_url,
      })
      .eq('profile_id', userId)
      .select()
      .single();

    if (error) throw error;
    return createResponse(data);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return createErrorResponse('Validation failed', 400, error.flatten().fieldErrors);
    }
    return handleApiError(error);
  }
}
