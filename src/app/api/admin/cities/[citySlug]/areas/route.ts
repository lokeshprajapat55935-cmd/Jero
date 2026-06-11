import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/supabase-server';
import { requireAdmin } from '@/lib/auth/admin';
import { createResponse, createErrorResponse, handleApiError } from '@/lib/api-utils';

/**
 * GET: Get all areas for a city
 * POST: Create new area
 */
export async function GET(request: Request, { params }: { params: Promise<{ citySlug: string }> }) {
  try {
    const userSupabase = await createClient();
    const gate = await requireAdmin(userSupabase);
    if (!gate.ok) return createErrorResponse(gate.message, gate.status);

    const { citySlug } = await params;
    const supabase = await createAdminClient();
    
    const { data, error } = await supabase
      .from('areas')
      .select('*, cities!inner(slug)')
      .eq('cities.slug', citySlug)
      .order('name', { ascending: true });

    if (error) throw error;

    return createResponse({
      areas: data || [],
      total: data?.length || 0,
      city: citySlug
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ citySlug: string }> }) {
  try {
    const userSupabase = await createClient();
    const gate = await requireAdmin(userSupabase);
    if (!gate.ok) return createErrorResponse(gate.message, gate.status);

    const { citySlug } = await params;
    const body = await request.json();
    const supabase = await createAdminClient();

    // Get city ID from slug
    const { data: cityData, error: cityError } = await supabase
      .from('cities')
      .select('id')
      .eq('slug', citySlug)
      .single();

    if (cityError || !cityData) {
      return createErrorResponse('City not found', 404);
    }

    // Validate input
    if (!body.name || !body.slug) {
      return createErrorResponse('Missing required fields: name, slug', 400);
    }

    const { data, error } = await supabase
      .from('areas')
      .insert({
        city_id: cityData.id,
        name: body.name,
        display_name: body.display_name || `${body.name}, ${citySlug}`,
        slug: body.slug,
        pincode: body.pincode,
        latitude: body.latitude,
        longitude: body.longitude
      })
      .select()
      .single();

    if (error) throw error;

    return createResponse({ area: data }, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
