import { createClient } from '@/lib/supabase/supabase-server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createResponse, createErrorResponse, handleApiError } from '@/lib/api-utils';
import logger from '@/lib/logger';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const categoryParam = searchParams.get('category');

    if (!categoryParam) {
      return createErrorResponse('Category query parameter is required', 400);
    }

    const categoryKey = categoryParam.toLowerCase().replace('-', '_');
    const admin = createAdminClient();

    // 1. Fetch category details from database to verify existence and get display parameters
    const { data: categoryDetail, error: catError } = await admin
      .from('service_categories')
      .select('id, name, icon, slug, is_active')
      .or(`id.eq.${categoryKey},slug.ilike.${categoryParam}`)
      .maybeSingle();

    if (catError) {
      logger.error(`Database error fetching category detail in catalog API: ${catError.message}`, { catError });
      return handleApiError(catError);
    }

    if (!categoryDetail || !categoryDetail.is_active) {
      logger.warn(`Category slug not found in database or inactive: ${categoryParam}`);
      return Response.json(
        { success: false, message: 'Category not found' },
        { status: 404 }
      );
    }

    // 2. Query catalog_services along with their nested catalog_sub_services from the database
    const { data: dbServices, error: dbError } = await admin
      .from('catalog_services')
      .select(`
        id,
        name,
        is_active,
        sub_services:catalog_sub_services(
          id,
          name,
          description,
          base_service_charge,
          visit_charge,
          is_active
        )
      `)
      .eq('category_id', categoryDetail.id)
      .eq('is_active', true)
      .order('name', { ascending: true });

    if (dbError) {
      logger.error(`Database query failed for catalog services: ${dbError.message}`, { dbError });
      return handleApiError(dbError);
    }

    // 3. Format services, filter out inactive sub-services, and sort them
    const formattedServices = (dbServices || []).map((service: any) => {
      const activeSubServices = (service.sub_services || [])
        .filter((sub: any) => sub.is_active)
        .sort((a: any, b: any) => a.name.localeCompare(b.name));
      return {
        ...service,
        sub_services: activeSubServices,
      };
    }).filter((service: any) => service.sub_services.length > 0);

    return createResponse({
      category: {
        id: categoryDetail.id,
        name: categoryDetail.name,
        icon: categoryDetail.icon || 'shield',
      },
      services: formattedServices,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
