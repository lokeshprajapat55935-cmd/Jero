import { NextRequest } from 'next/server';
import { createResponse, handleApiError } from '@/lib/api-utils';

export async function GET(request: NextRequest) {
  try {
    // In a fully scaled app, this would query a Redis cache or a pre-computed Materialized View in Postgres.
    // For now, we return statically defined trending items for instant load.
    const trending = [
      { id: 't2', title: 'Electrician', slug: 'electrician', icon: '⚡' },
      { id: 't4', title: 'Plumbing', slug: 'plumber', icon: '💧' },
    ];

    const response = createResponse({ trending });
    // Cache for 1 hour since trending doesn't change by the second
    response.headers.set('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
    
    return response;
  } catch (error) {
    return handleApiError(error);
  }
}
