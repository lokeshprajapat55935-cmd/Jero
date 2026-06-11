import { createClient } from '@/lib/supabase/supabase-server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createResponse, handleApiError } from '@/lib/api-utils';
import { CATEGORIES } from '@/lib/constants';

export async function GET() {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from('service_categories')
      .select('*')
      .eq('is_active', true)
      .order('sort_order', { ascending: true });

    if (!error && data?.length) {
      const response = createResponse({ categories: data });
      response.headers.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=600');
      return response;
    }

    const response = createResponse({
      categories: CATEGORIES.map((c, i) => ({
        id: c.id,
        name: c.name,
        slug: c.slug,
        sort_order: i + 1,
        is_active: true,
      })),
    });
    response.headers.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=600');
    return response;
  } catch (error) {
    return handleApiError(error);
  }
}