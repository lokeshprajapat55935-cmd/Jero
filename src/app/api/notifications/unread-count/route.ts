import { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/supabase-server';
import { createResponse, createErrorResponse, handleApiError, getAuthUserId } from '@/lib/api-utils';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const userId = await getAuthUserId(request, supabase);

    if (!userId) {
      return createErrorResponse('Unauthorized', 401);
    }

    // Count unread notifications using exact head select
    const { count, error } = await supabase
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('is_read', false);

    if (error) {
      return createErrorResponse(error.message, 500);
    }

    return createResponse({ success: true, count: count || 0, unreadCount: count || 0 });
  } catch (error) {
    return handleApiError(error);
  }
}
