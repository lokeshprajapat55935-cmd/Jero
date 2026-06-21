import { createClient } from '@/lib/supabase/supabase-server';
import { createResponse, createErrorResponse, handleApiError, getAuthUserId } from '@/lib/api-utils';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const userId = await getAuthUserId(request as any, supabase);
    if (!userId) return createErrorResponse('Unauthorized', 401);

    const { searchParams } = new URL(request.url);
    const worker_id = searchParams.get('worker_id');
    const category = searchParams.get('category');
    
    if (!worker_id || !category) {
      return createErrorResponse('worker_id and category required', 400);
    }

    // Must be the worker themselves
    if (worker_id !== userId) {
      return createErrorResponse('Forbidden', 403);
    }

    const admin = createAdminClient();

    // Call the RPC created in the migration to fetch frequent items
    const { data: frequentItems, error } = await admin.rpc('get_worker_frequent_items', {
      p_worker_id: worker_id,
      p_category: category,
      p_limit: 10,
    });

    if (error) {
      // If RPC is missing (e.g., migration not pushed), fallback to an empty array
      if (error.code === 'PGRST202' || String(error.message).includes('Could not find the function')) {
        console.warn('[GET /api/bookings/items/frequent] RPC missing, returning empty array');
        return createResponse({ items: [] });
      }
      throw error;
    }

    return createResponse({ items: frequentItems || [] });
  } catch (error) {
    return handleApiError(error);
  }
}
