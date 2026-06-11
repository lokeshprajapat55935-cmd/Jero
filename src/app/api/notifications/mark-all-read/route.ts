import { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/supabase-server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createResponse, createErrorResponse, handleApiError, getAuthUserId } from '@/lib/api-utils';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const userId = await getAuthUserId(request, supabase);

    if (!userId) {
      return createErrorResponse('Unauthorized', 401);
    }

    const admin = createAdminClient();

    // Mark all unread notifications as read
    const { error } = await admin
      .from('notifications')
      .update({ is_read: true, read_status: 'read' })
      .eq('user_id', userId)
      .eq('is_read', false);

    if (error) {
      return createErrorResponse(error.message, 500);
    }

    return createResponse({ success: true, message: 'All notifications marked as read.' });
  } catch (error) {
    return handleApiError(error);
  }
}
