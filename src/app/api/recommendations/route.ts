import { NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createResponse, handleApiError, getAuthUserId, createErrorResponse } from '@/lib/api-utils';

export async function GET(request: NextRequest) {
  try {
    const admin = createAdminClient();
    
    // Verify authentication
    const userId = await getAuthUserId(request, admin);
    if (!userId) {
      return createErrorResponse('Unauthorized: Please log in', 401);
    }

    // Verify role is client (customer)
    const { data: profile, error: profileError } = await admin
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .single();

    if (profileError || !profile || profile.role !== 'client') {
      return createErrorResponse('Forbidden: Customer access only', 403);
    }

    // Fetch top 5 approved workers ordered by rating
    const { data, error } = await admin
      .from('workers')
      .select(`
        id,
        category,
        base_service_charge,
        experience_years,
        rating_avg,
        review_count,
        status,
        profiles!inner(
          full_name,
          avatar_url,
          location_name
        )
      `)
      .eq('status', 'approved')
      .order('rating_avg', { ascending: false })
      .order('review_count', { ascending: false })
      .limit(5);

    if (error) {
      throw error;
    }

    // Format the data to easily consume on the frontend
    const formattedData = (data || []).map((worker: any) => ({
      id: worker.id,
      name: worker.profiles?.full_name || 'Professional',
      category: worker.category,
      price: worker.base_service_charge,
      experience: worker.experience_years,
      rating: worker.rating_avg || 0,
      reviews: worker.review_count || 0,
      avatar_url: worker.profiles?.avatar_url || null,
      location: worker.profiles?.location_name || 'Nearby',
    }));

    const response = createResponse({ recommendations: formattedData });
    // Cache for 2 minutes to keep home page fast but relatively fresh
    response.headers.set('Cache-Control', 'public, max-age=120, stale-while-revalidate=600');
    
    return response;
  } catch (error) {
    return handleApiError(error);
  }
}
