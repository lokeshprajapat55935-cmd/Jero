import { createClient } from '@/lib/supabase/supabase-server';
import { createResponse, createErrorResponse, handleApiError, getAuthUserId } from '@/lib/api-utils';
import { createAdminClient } from '@/lib/supabase/admin';
import { z } from 'zod';

const settingsSchema = z.object({
  language: z.enum(['hi', 'en']).optional(),
  notifications_enabled: z.boolean().optional(),
  dark_mode: z.boolean().optional(),
});

export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const userId = await getAuthUserId(request as any, supabase);
    if (!userId) return createErrorResponse('Unauthorized', 401);

    const admin = createAdminClient();
    const { data, error } = await admin
      .from('user_preferences')
      .select('language, notifications_enabled, dark_mode')
      .eq('profile_id', userId)
      .maybeSingle();

    if (error) throw error;

    // Return defaults if no preferences row yet
    return createResponse({
      language: data?.language ?? 'hi',
      notifications_enabled: data?.notifications_enabled ?? true,
      dark_mode: data?.dark_mode ?? false,
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

    const body = await request.json();
    const validated = settingsSchema.parse(body);

    const admin = createAdminClient();

    // Upsert — create row if not exists, update if exists
    const { data, error } = await admin
      .from('user_preferences')
      .upsert(
        {
          profile_id: userId,
          ...validated,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'profile_id' }
      )
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
