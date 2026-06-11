import { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/supabase-server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createResponse, createErrorResponse, handleApiError, getAuthUserId } from '@/lib/api-utils';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const userId = await getAuthUserId(request, supabase);

    if (!userId) {
      return createErrorResponse('Unauthorized', 401);
    }

    const admin = createAdminClient();

    // Verify ownership and update status
    const { data, error } = await admin
      .from('notifications')
      .update({ is_read: true, read_status: 'read' })
      .eq('id', id)
      .eq('user_id', userId)
      .select('*')
      .maybeSingle();

    if (error) {
      return createErrorResponse(error.message, 500);
    }

    if (!data) {
      return createErrorResponse('Notification not found or access denied', 404);
    }

    return createResponse({ success: true, notification: data });
  } catch (error) {
    return handleApiError(error);
  }
}
