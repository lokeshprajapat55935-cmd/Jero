import { createClient } from '@/lib/supabase/supabase-server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createResponse, createErrorResponse, handleApiError } from '@/lib/api-utils';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q') || '';

    if (!query.trim()) {
      return createResponse({ results: [] });
    }

    const admin = createAdminClient();

    // Query sub-services that match search term, joining their parent services and categories
    const { data: results, error } = await admin
      .from('catalog_sub_services')
      .select(`
        id,
        name,
        description,
        base_service_charge,
        visit_charge,
        service:catalog_services!inner(
          name,
          category_id,
          is_active
        )
      `)
      .eq('is_active', true)
      .eq('service.is_active', true)
      .ilike('name', `%${query}%`)
      .limit(30);

    if (error) {
      throw error;
    }

    // Hydrate the categories from service_categories if needed
    const { data: categories } = await admin
      .from('service_categories')
      .select('id, name');
    
    const categoryMap = new Map((categories || []).map(c => [c.id, c.name]));

    // Format the results for easy frontend rendering
    const formattedResults = (results || []).map((sub: any) => {
      const catId = sub.service?.category_id;
      const catName = categoryMap.get(catId) || catId;
      return {
        id: sub.id,
        sub_service_name: sub.name,
        service_name: sub.service?.name,
        category_id: catId,
        category_name: catName,
        base_charge: sub.base_service_charge,
        visit_charge: sub.visit_charge,
        description: sub.description,
      };
    });

    return createResponse({ results: formattedResults });
  } catch (error) {
    return handleApiError(error);
  }
}
