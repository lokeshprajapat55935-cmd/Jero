import { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/supabase-server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createResponse, createErrorResponse, handleApiError, getAuthUserId } from '@/lib/api-utils';
import { z } from 'zod';

const registerTokenSchema = z.object({
  token: z.string().min(1),
  platform: z.enum(['web', 'android', 'ios', 'other']).default('web'),
});

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const userId = await getAuthUserId(request, supabase);

    if (!userId) {
      return createErrorResponse('Unauthorized', 401);
    }

    const body = await request.json().catch(() => ({}));
    const { token, platform } = registerTokenSchema.parse(body);

    const admin = createAdminClient();

    // Register token (using upsert to prevent unique constraint failures)
    const { error } = await admin
      .from('user_device_tokens')
      .upsert(
        {
          user_id: userId,
          token,
          platform,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id, token' }
      );

    if (error) {
      return createErrorResponse(error.message, 500);
    }

    return createResponse({ success: true, message: 'FCM device token registered successfully.' });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return createErrorResponse('Invalid token registration details.', 400, error.flatten().fieldErrors);
    }
    return handleApiError(error);
  }
}
