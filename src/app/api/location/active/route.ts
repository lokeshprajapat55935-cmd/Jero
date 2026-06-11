import { locationService } from '@/services/location';
import { createResponse, handleApiError } from '@/lib/api-utils';

// Server-side in-memory cache
let cachedData: any = null;
let lastFetched: number = 0;
const CACHE_TTL_MS = 60 * 1000; // 60 seconds cache

export async function GET() {
  try {
    const now = Date.now();
    if (cachedData && (now - lastFetched < CACHE_TTL_MS)) {
      const response = createResponse(cachedData);
      response.headers.set('Cache-Control', 'public, max-age=30, stale-while-revalidate=60');
      return response;
    }

    const activeCitySlug = await locationService.getActiveCitySlug();
    
    const [activeCity, mode, areas] = await Promise.all([
      locationService.getActiveCity(activeCitySlug),
      locationService.getPlatformMode(),
      locationService.getAreasForCity(activeCitySlug),
    ]);

    const data = {
      activeCity,
      activeCitySlug,
      mode,
      areas,
    };

    cachedData = data;
    lastFetched = now;

    const response = createResponse(data);
    response.headers.set('Cache-Control', 'public, max-age=30, stale-while-revalidate=60');
    return response;
  } catch (error) {
    if (cachedData) {
      console.warn('Database query failed for active location, serving fallback cached data:', error);
      const response = createResponse(cachedData);
      response.headers.set('Cache-Control', 'public, max-age=30, stale-while-revalidate=60');
      return response;
    }
    return handleApiError(error);
  }
}
