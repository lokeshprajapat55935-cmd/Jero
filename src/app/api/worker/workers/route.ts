import { createClient } from '@/lib/supabase/supabase-server';
import { createResponse, handleApiError } from '@/lib/api-utils';
import { locationService } from '@/services/location';

const QUERY_TIMEOUT_MS = 4000;

function withTimeout<T>(promise: PromiseLike<T>, timeoutMs = QUERY_TIMEOUT_MS): Promise<T | null> {
  return Promise.race([
    promise,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
  ]);
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category');
    const query = searchParams.get('query');
    const areaId = searchParams.get('areaId');
    const sortBy = searchParams.get('sort') || 'rating';
    const limit = parseInt(searchParams.get('limit') || '10');
    const offset = parseInt(searchParams.get('offset') || '0');

    // Get active city (should be Bhilwara)
    const activeCity = await locationService.getActiveCity();
    
    if (!activeCity) {
      return createResponse(
        { 
          workers: [], 
          total: 0, 
          error: 'No active city configured',
          message: 'Currently, service is not available in your area. Please check back soon.'
        },
        503
      );
    }

    const supabase = await createClient();
    
    let dbQuery = supabase
      .from('workers')
      .select(`
        *,
        profile:profiles(full_name, avatar_url, location_name),
        location:worker_locations!inner(
          city_id,
          area_id,
          area:areas(*)
        )
      `, { count: 'exact' })
      .eq('status', 'approved')
      .eq('location.city_id', activeCity.id);

    if (category && category !== 'all') {
      dbQuery = dbQuery.eq('category', category);
    }

    if (areaId) {
      dbQuery = dbQuery.eq('location.area_id', areaId);
    }

    if (query) {
      dbQuery = dbQuery.textSearch('search_vector', query, {
        type: 'websearch',
        config: 'english'
      });
    }

    const orderColumn = sortBy === 'price' ? 'base_service_charge' : 'rating_avg';
    const ascending = sortBy === 'price';

    const result = await withTimeout(
      dbQuery
        .order(orderColumn, { ascending })
        .range(offset, offset + limit - 1)
    );

    if (!result) {
      throw new Error('Worker search timed out');
    }

    const { data, error, count } = result;

    if (error) throw error;

    const formattedWorkers = (data || []).map((w: any) => ({
      ...w,
      area: w.location?.area || null,
    }));

    const response = createResponse({
      workers: formattedWorkers,
      total: count || 0,
      limit,
      offset,
      city: activeCity.name,
      message: `Found ${count || 0} professionals in ${activeCity.name}`
    });
    response.headers.set('Cache-Control', 'public, max-age=10, stale-while-revalidate=59');
    return response;
  } catch (error) {
    return handleApiError(error);
  }
}
