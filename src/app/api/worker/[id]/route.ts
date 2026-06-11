import { createClient } from '@/lib/supabase/supabase-server';
import { createResponse, createErrorResponse, handleApiError } from '@/lib/api-utils';

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const supabase = await createClient();

    const { data, error } = await supabase
      .from('workers')
      .select(`*, profile:profiles(full_name, avatar_url, location_name, phone), area:areas(name, slug), services(*)`)
      .eq('id', id)
      .eq('status', 'approved')
      .maybeSingle();

    if (data) {
      const response = createResponse(data);
      response.headers.set('Cache-Control', 'public, max-age=10, stale-while-revalidate=59');
      return response;
    }

    if (error) throw error;
    return createErrorResponse('Worker not found', 404);
  } catch (error) {
    return handleApiError(error);
  }
}