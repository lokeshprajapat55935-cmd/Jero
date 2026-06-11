import { createAdminClient } from '@/lib/supabase/admin';
import { createResponse, createErrorResponse, handleApiError, getAuthUserId } from '@/lib/api-utils';
import { z } from 'zod';

const clientProfileSchema = z.object({
  full_name: z.string().optional(),
  phone: z.string().optional(),
  location_name: z.string().optional(),
});

export async function GET(request: Request) {
  try {
    const admin = createAdminClient();
    const userId = await getAuthUserId(request as any, admin);

    if (!userId) return createErrorResponse('Unauthorized', 401);

    const { data, error } = await admin
      .from('profiles')
      .select('*, clients(*)')
      .eq('id', userId)
      .single();

    if (error) throw error;
    return createResponse(data);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const admin = createAdminClient();
    const userId = await getAuthUserId(request as any, admin);

    if (!userId) return createErrorResponse('Unauthorized', 401);

    const body = await request.json();
    const validatedData = clientProfileSchema.partial().parse(body);

    const { data, error } = await admin
      .from('profiles')
      .update(validatedData)
      .eq('id', userId)
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
