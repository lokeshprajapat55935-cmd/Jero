import { createClient } from '@/lib/supabase/supabase-server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createResponse, createErrorResponse, handleApiError, getAuthUserId } from '@/lib/api-utils';
import { z } from 'zod';
import logger from '@/lib/logger';

const saveSchema = z.object({
  current_step: z.number().min(1).max(6),
  // Step 1
  full_name: z.string().min(2).optional(),
  gender: z.string().optional(),
  dob: z.string().optional(),
  // Step 2
  selfie_url: z.string().url().optional(),
  bio: z.string().optional(),
  // Step 3
  city_id: z.string().uuid().optional(),
  address: z.string().optional(),
  working_areas: z.array(z.string()).optional(),
  // Step 4
  service_category: z.string().optional(),
  experience: z.string().optional(),
  skills: z.array(z.string()).optional(),
  languages: z.array(z.string()).optional(),
  // Step 5
  id_proof_type: z.string().optional(),
  id_proof_url: z.string().url().optional(),
  aadhaar_number: z.string().optional(),
  pan_number: z.string().optional(),
  // Step 6
  bank_holder_name: z.string().optional(),
  bank_account_number: z.string().optional(),
  ifsc_code: z.string().optional(),
  upi_id: z.string().optional(),
  // Final Completion Flag
  complete: z.boolean().optional(),
});

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const userId = await getAuthUserId(request as any, supabase);
    if (!userId) return createErrorResponse('Not authenticated', 401);

    const body = await request.json();
    console.log('[API Onboarding Save] Body:', JSON.stringify(body, null, 2));
    
    let validated;
    try {
      validated = saveSchema.parse(body);
    } catch (zodErr: any) {
      console.error('[API Onboarding Save] Zod Validation Failed:', zodErr.errors);
      return createErrorResponse('Validation error', 400, zodErr.flatten().fieldErrors);
    }

    const admin = createAdminClient();

    // Verify user is registered as a worker
    const { data: profile, error: profileError } = await admin
      .from('profiles')
      .select('id, role, onboarded')
      .eq('id', userId)
      .single();

    console.log('[API Onboarding Save] Profile Check:', { userId, profile, error: profileError });

    if (profileError || !profile || (profile.role !== 'worker' && profile.role !== 'admin')) {
      return createErrorResponse('Access denied. Profile is not registered as a worker/partner.', 403);
    }

    // Check if partner profile exists and its current status
    const { data: currentPartner } = await admin
      .from('partners')
      .select('status, bank_holder_name')
      .eq('profile_id', userId)
      .maybeSingle();

    // Block modifications only when:
    //  - status is 'under_review' (application submitted, awaiting admin review), OR
    //  - status is 'approved' AND payout details are already filled
    // Allow approved workers with missing payout (bank_holder_name=NULL) to complete step 6.
    const payoutAlreadyComplete = !!currentPartner?.bank_holder_name;
    if (currentPartner && (
      currentPartner.status === 'under_review' ||
      (currentPartner.status === 'approved' && payoutAlreadyComplete)
    )) {
      return createErrorResponse('Onboarding cannot be modified once approved or under review.', 400);
    }

    // Map payload to database fields
    const partnerUpsert: any = {
      profile_id: userId,
      current_step: validated.current_step,
      updated_at: new Date().toISOString(),
    };

    // Step 1 mappings
    if (validated.full_name) partnerUpsert.full_name = validated.full_name;
    if (validated.gender) partnerUpsert.gender = validated.gender;
    if (validated.dob) partnerUpsert.dob = validated.dob ? new Date(validated.dob).toISOString().split('T')[0] : null;

    // Step 2 mappings
    if (validated.selfie_url) partnerUpsert.selfie_url = validated.selfie_url;
    if (validated.bio) partnerUpsert.bio = validated.bio;

    // Step 3 mappings
    if (validated.city_id) partnerUpsert.city_id = validated.city_id;
    if (validated.address) partnerUpsert.address = validated.address;
    if (validated.working_areas) partnerUpsert.working_areas = validated.working_areas;

    // Step 4 mappings
    if (validated.service_category) partnerUpsert.service_category = validated.service_category;
    if (validated.experience) partnerUpsert.experience = validated.experience;
    if (validated.skills) partnerUpsert.skills = validated.skills;
    if (validated.languages) partnerUpsert.languages = validated.languages;

    // Step 5 mappings
    if (validated.id_proof_type) partnerUpsert.id_proof_type = validated.id_proof_type;
    if (validated.id_proof_url) partnerUpsert.id_proof_url = validated.id_proof_url;
    if (validated.aadhaar_number) partnerUpsert.aadhaar_number = validated.aadhaar_number;
    if (validated.pan_number) partnerUpsert.pan_number = validated.pan_number;

    // Step 6 mappings
    if (validated.bank_holder_name) partnerUpsert.bank_holder_name = validated.bank_holder_name;
    if (validated.bank_account_number) partnerUpsert.bank_account_number = validated.bank_account_number;
    if (validated.ifsc_code) partnerUpsert.ifsc_code = validated.ifsc_code;
    if (validated.upi_id) partnerUpsert.upi_id = validated.upi_id;

    // Handle final submission complete
    if (validated.complete) {
      partnerUpsert.status = 'under_review';
      partnerUpsert.current_step = 6;
    }

    // Upsert into partners
    const { data: updatedPartner, error: upsertError } = await admin
      .from('partners')
      .upsert(partnerUpsert, { onConflict: 'profile_id' })
      .select('*')
      .single();

    if (upsertError) throw upsertError;

    // If final submission, update profile's onboarded status
    if (validated.complete) {
      const { error: updateProfileError } = await admin
        .from('profiles')
        .update({ onboarded: true })
        .eq('id', userId);

      if (updateProfileError) {
        logger.error('Failed to update profiles.onboarded to true on final submit', { userId });
      }
    }

    return createResponse({ partner: updatedPartner });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return createErrorResponse('Validation error', 400, error.flatten().fieldErrors);
    }
    return handleApiError(error);
  }
}
