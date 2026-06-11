import { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/supabase-server';
import { createResponse, handleApiError } from '@/lib/api-utils';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const query = searchParams.get('q')?.trim() || '';

    if (!query) {
      return createResponse({ results: [] });
    }

    const supabase = await createClient();

    // 1. Search Categories
    const { data: categoriesData, error: categoriesError } = await supabase
      .from('service_categories')
      .select('id, name, slug, icon')
      .ilike('name', `%${query}%`)
      .limit(5);

    if (categoriesError) {
      throw categoriesError;
    }

    // 2. Search Workers
    const { data: workersData, error: workersError } = await supabase
      .from('workers')
      .select(`
        id,
        category,
        base_service_charge,
        rating_avg,
        status,
        profiles:profiles!id!inner(
          full_name,
          avatar_url,
          location_name
        )
      `)
      .eq('status', 'approved')
      .or(`profiles.full_name.ilike.%${query}%,category.ilike.%${query}%`)
      .limit(10);

    if (workersError) {
      throw workersError;
    }

    // Unify Results
    const formattedResults: any[] = [];

    // Prioritize Exact matches and Category matches
    if (categoriesData && categoriesData.length > 0) {
      categoriesData.forEach((cat) => {
        formattedResults.push({
          type: 'category',
          id: cat.id,
          title: cat.name,
          slug: cat.slug,
          icon: cat.icon,
        });
      });
    }

    if (workersData && workersData.length > 0) {
      workersData.forEach((worker: any) => {
        formattedResults.push({
          type: 'worker',
          id: worker.id,
          title: worker.profiles?.full_name || 'Professional',
          category: worker.category,
          price: worker.base_service_charge,
          rating: worker.rating_avg || 0,
          avatar_url: worker.profiles?.avatar_url || null,
          location: worker.profiles?.location_name || 'Nearby',
        });
      });
    }

    const response = createResponse({ results: formattedResults });
    // Cache search results for 1 minute to alleviate DB load on frequent searches
    response.headers.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=120');

    return response;
  } catch (error) {
    return handleApiError(error);
  }
}
