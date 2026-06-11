import { createClient } from '@/lib/supabase/supabase-server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createResponse, createErrorResponse, handleApiError, getAuthUserId } from '@/lib/api-utils';
import { roleSelectionSchema } from '@/lib/auth/validation';
import { config } from '@/config';
import logger from '@/lib/logger';
import { z } from 'zod';

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const userId = await getAuthUserId(request as any, supabase);

    if (!userId) {
      return createErrorResponse('Unauthorized', 401);
    }

    const body = await request.json();
    const validated = roleSelectionSchema.parse(body);
    const selectedRole = validated.role;

    // Fetch existing profile to populate fallback metadata
    const { data: profile } = await supabase
      .from('profiles')
      .select('email, phone, full_name, avatar_url')
      .eq('id', userId)
      .maybeSingle();

    // Retrieve other fields needed for profile upsert
    const email = body.email ?? profile?.email ?? null;
    const phone = body.phone ?? profile?.phone ?? null;
    const full_name = body.full_name ?? profile?.full_name ?? null;
    const avatar_url = body.avatar_url ?? profile?.avatar_url ?? null;

    let dbClient;
    let isElevated = false;

    // Use admin client if key is available to bypass client RLS trigger rules
    if (config.env.supabase.serviceRoleKey) {
      dbClient = createAdminClient();
      isElevated = true;
    } else {
      // Fallback to user client if service role key is missing in development
      logger.warn('Role Selection API: SUPABASE_SERVICE_ROLE_KEY is missing, falling back to authenticated client.');
      dbClient = supabase;
    }

    const { error: profileError } = await dbClient
      .from('profiles')
      .upsert({
        id: userId,
        role: selectedRole,
        onboarded: selectedRole !== 'worker',
        email,
        phone,
        full_name,
        avatar_url,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'id' });

    if (profileError) {
      logger.error('Onboarding API: Profile upsert failed', {
        userId: userId,
        error: profileError,
        isElevated,
      });
      return createErrorResponse(`Profile configuration failed: ${profileError.message}`, 400);
    }

    // 2. Initialize role-specific metadata
    if (selectedRole === 'worker') {
      const { error: workerError } = await dbClient
        .from('workers')
        .upsert({
          id: userId,
          category: 'Other',
          base_service_charge: 0,
          visit_charge: 0,
        }, { onConflict: 'id' });

      if (workerError) {
        logger.error('Onboarding API: Worker metadata upsert failed', {
          userId: userId,
          error: workerError,
          isElevated,
        });
        return createErrorResponse(`Worker metadata configuration failed: ${workerError.message}`, 400);
      }
    } else {
      const { error: clientError } = await dbClient
        .from('clients')
        .upsert({
          id: userId,
          phone,
        }, { onConflict: 'id' });

      if (clientError) {
        logger.error('Onboarding API: Client metadata upsert failed', {
          userId: userId,
          error: clientError,
          isElevated,
        });
        return createErrorResponse(`Client metadata configuration failed: ${clientError.message}`, 400);
      }
    }

    logger.info('Onboarding API: Onboarding successfully completed', {
      userId: userId,
      role: selectedRole,
      isElevated,
    });

    return createResponse({ success: true, role: selectedRole });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return createErrorResponse('Validation error', 400, error.flatten().fieldErrors);
    }
    return handleApiError(error);
  }
}
