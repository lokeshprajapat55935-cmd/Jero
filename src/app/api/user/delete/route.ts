import { NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/supabase-server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createResponse, createErrorResponse, handleApiError, getAuthUserId } from '@/lib/api-utils';

export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient();
    const userId = await getAuthUserId(request, supabase);

    if (!userId) {
      return createErrorResponse('Unauthorized', 401);
    }

    const admin = createAdminClient();

    // 1. Delete user from Supabase Auth (Cascades to profiles, workers, clients, etc.)
    const { error: deleteError } = await admin.auth.admin.deleteUser(userId);
    if (deleteError) {
      throw deleteError;
    }

    // 2. Clear authentication cookies
    const cookieStore = await cookies();

    return createResponse({ success: true, message: 'Account deleted successfully' });
  } catch (error) {
    return handleApiError(error);
  }
}
