import { NextRequest } from 'next/server';
import { createResponse, handleApiError } from '@/lib/api-utils';

export async function POST(request: NextRequest) {
  try {
    const { query } = await request.json();

    if (!query) {
      return createResponse({ success: false, message: 'Query is required' }, 400);
    }

    // In a fully scaled app, this would insert into a 'search_logs' table for analytics
    // e.g., await supabase.from('search_logs').insert({ query, user_id })
    // For now, it acts as a fire-and-forget logging endpoint.

    return createResponse({ success: true });
  } catch (error) {
    return handleApiError(error);
  }
}
