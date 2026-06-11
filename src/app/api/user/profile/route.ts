import { createAdminClient } from '@/lib/supabase/admin';
import { createResponse, createErrorResponse, handleApiError, getAuthUserId } from '@/lib/api-utils';
import { z } from 'zod';

const profileUpdateSchema = z.object({
  full_name: z.string().max(100).optional(),
  phone: z.string().max(20).optional(),
  location_name: z.string().max(100).optional(),
  avatar_url: z.string().max(1000).optional(),
});

export async function GET(request: Request) {
  try {
    const admin = createAdminClient();
    const userId = await getAuthUserId(request as any, admin);

    if (!userId) {
      return createErrorResponse('Unauthorized', 401);
    }

    const { data: profile, error: profileError } = await admin
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (profileError) throw profileError;

    return createResponse(profile);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const admin = createAdminClient();
    const userId = await getAuthUserId(request as any, admin);

    if (!userId) {
      return createErrorResponse('Unauthorized', 401);
    }

    const body = await request.json();
    
    // Basic email check
    if (body.email) {
      return createErrorResponse('Email cannot be changed directly', 400);
    }

    // Strict Zod whitelisting validation
    const validatedData = profileUpdateSchema.parse(body);

    const { data: profile, error: updateError } = await admin
      .from('profiles')
      .update(validatedData)
      .eq('id', userId)
      .select()
      .single();

    if (updateError) throw updateError;

    return createResponse(profile);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return createErrorResponse('Validation error', 400, error.flatten().fieldErrors);
    }
    return handleApiError(error);
  }
}
