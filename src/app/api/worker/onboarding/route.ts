import { createClient } from '@/lib/supabase/supabase-server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createResponse, createErrorResponse, handleApiError, getAuthUserId } from '@/lib/api-utils';
import { z } from 'zod';
import { config } from '@/config';
import logger from '@/lib/logger';

const onboardingSchema = z.object({
  step: z.number().min(1).max(6),
  // Step 1 basic details
  full_name: z.string().min(2).optional(),
  avatar_url: z.string().url().optional(),
  dob: z.string().optional(),
  gender: z.string().optional(),
  // Step 2 location details
  city_id: z.string().uuid().optional(),
  area_id: z.string().uuid().optional(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  // Step 3 categories
  categories: z.array(z.string()).optional(),
  // Step 4 documents
  documents: z.array(z.object({
    document_type: z.enum(['aadhaar', 'selfie', 'police_verification']),
    document_url: z.string().url(),
  })).optional(),
  // Step 5 wallet
  wallet_activation: z.boolean().optional(),
  // Step 6 submit review
  complete: z.boolean().optional(),
});

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const userId = await getAuthUserId(request as any, supabase);
    if (!userId) return createErrorResponse('Not authenticated', 401);

    const body = await request.json();
    const validated = onboardingSchema.parse(body);

    if (!config.env.supabase.serviceRoleKey) {
      logger.error('Onboarding API Failure: SUPABASE_SERVICE_ROLE_KEY environment variable is not defined.');
      return createErrorResponse(
        'Server environment error: SUPABASE_SERVICE_ROLE_KEY is missing. Please add it to your .env.local file.',
        500
      );
    }

    const admin = createAdminClient();

    // Verify user is registered as a worker
    const { data: workerProfile, error: profileError } = await admin
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .single();

    if (profileError || workerProfile.role !== 'worker') {
      return createErrorResponse('User is not registered as a worker profile.', 403);
    }

    const { data: workerData, error: workerError } = await admin
      .from('workers')
      .select('status')
      .eq('id', userId)
      .single();

    if (workerError) throw workerError;

    // If worker is already approved/under review, block changes unless they are pending/rejected
    if (workerData.status === 'approved' || workerData.status === 'under_review') {
      return createErrorResponse('Onboarding cannot be modified once approved or under review.', 400);
    }

    // Process based on step
    if (validated.step === 1) {
      // Step 1: Update name and avatar in profiles, and DOB/gender in workers
      if (validated.full_name || validated.avatar_url) {
        await admin
          .from('profiles')
          .update({
            ...(validated.full_name ? { full_name: validated.full_name } : {}),
            ...(validated.avatar_url ? { avatar_url: validated.avatar_url } : {}),
          })
          .eq('id', userId);
      }

      await admin
        .from('workers')
        .update({
          dob: validated.dob ? new Date(validated.dob).toISOString().split('T')[0] : null,
          gender: validated.gender || null,
          onboarding_step: 2,
        })
        .eq('id', userId);
    } 
    
    else if (validated.step === 2) {
      // Step 2: Location
      if (!validated.city_id || !validated.area_id) {
        return createErrorResponse('City and Area IDs are required for step 2.', 400);
      }

      await admin
        .from('workers')
        .update({
          onboarding_step: 3,
        })
        .eq('id', userId);

      // Insert/update worker_locations
      await admin
        .from('worker_locations')
        .upsert({
          worker_id: userId,
          latitude: validated.latitude ?? null,
          longitude: validated.longitude ?? null,
          city_id: validated.city_id,
          area_id: validated.area_id,
          last_active_at: new Date().toISOString(),
        }, { onConflict: 'worker_id' });
    } 
    
    else if (validated.step === 3) {
      // Step 3: Categories
      if (!validated.categories || validated.categories.length === 0) {
        return createErrorResponse('Select at least one category.', 400);
      }

      // Set primary category in workers table
      const primaryCategory = validated.categories[0];
      await admin
        .from('workers')
        .update({
          category: primaryCategory,
          onboarding_step: 4,
        })
        .eq('id', userId);

      // Delete existing categories first to replace
      await admin
        .from('worker_service_categories')
        .delete()
        .eq('worker_id', userId);

      // Insert selected categories
      const categoryInserts = validated.categories.map(cat => ({
        worker_id: userId,
        category: cat,
      }));
      await admin.from('worker_service_categories').insert(categoryInserts);
    } 
    
    else if (validated.step === 4) {
      // Step 4: Documents
      if (!validated.documents || validated.documents.length === 0) {
        return createErrorResponse('Upload documents to proceed.', 400);
      }

      // Delete old doc registrations of same type
      const docTypes = validated.documents.map(d => d.document_type);
      await admin
        .from('worker_documents')
        .delete()
        .eq('worker_id', userId)
        .in('document_type', docTypes);

      const documentInserts = validated.documents.map(doc => ({
        worker_id: userId,
        document_type: doc.document_type,
        document_url: doc.document_url,
        verified: false, // Must be approved by admin
      }));

      await admin.from('worker_documents').insert(documentInserts);

      await admin
        .from('workers')
        .update({ onboarding_step: 5 })
        .eq('id', userId);
    } 
    
    else if (validated.step === 5) {
      // Step 5: Wallet activation
      if (validated.wallet_activation) {
        // Initialize/update wallet with minimum balance ₹500
        await admin
          .from('worker_wallets')
          .upsert({
            worker_id: userId,
            balance: 500.00,
            currency: 'INR',
            updated_at: new Date().toISOString(),
          }, { onConflict: 'worker_id' });
      }

      await admin
        .from('workers')
        .update({ onboarding_step: 6 })
        .eq('id', userId);
    } 
    
    else if (validated.step === 6) {
      // Step 6: Review & Final Submit
      if (validated.complete) {
        // Mark onboarding completed and status as under_review
        await admin
          .from('workers')
          .update({
            onboarding_completed: true,
            status: 'under_review',
            onboarding_step: 6,
          })
          .eq('id', userId);
      }
    }

    // Fetch updated worker data to return
    const { data: updatedWorker } = await admin
      .from('workers')
      .select(`
        *,
        profile:profiles(*),
        documents:worker_documents(*),
        wallet:worker_wallets(*),
        location:worker_locations(*),
        categories:worker_service_categories(category)
      `)
      .eq('id', userId)
      .single();

    return createResponse({ worker: updatedWorker });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return createErrorResponse('Validation error', 400, error.flatten().fieldErrors);
    }
    return handleApiError(error);
  }
}
