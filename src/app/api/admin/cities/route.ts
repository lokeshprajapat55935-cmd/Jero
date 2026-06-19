import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/supabase-server';
import { requireAdmin } from '@/lib/auth/admin';
import { createResponse, createErrorResponse, handleApiError } from '@/lib/api-utils';

/**
 * GET: Get all cities
 * POST: Create new city
 */
export async function GET(request: Request) {
  try {
    const userSupabase = await createClient();
    const gate = await requireAdmin(userSupabase);
    if (!gate.ok) return createErrorResponse(gate.message, gate.status);

    const supabase = await createAdminClient();
    
    const { data, error } = await supabase
      .from('cities')
      .select(`
        *,
        state:states(*),
        areas(id, name, slug)
      `)
      .order('name', { ascending: true });

    if (error) throw error;

    return createResponse({
      cities: data || [],
      total: data?.length || 0
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const userSupabase = await createClient();
    const gate = await requireAdmin(userSupabase);
    if (!gate.ok) return createErrorResponse(gate.message, gate.status);

    const body = await request.json();
    const supabase = await createAdminClient();

    // Validate input
    if (!body.state_id || !body.name || !body.slug) {
      return createErrorResponse('Missing required fields: state_id, name, slug', 400);
    }

    const { data, error } = await supabase
      .from('cities')
      .insert({
        state_id: body.state_id,
        name: body.name,
        slug: body.slug,
        description: body.description,
        latitude: body.latitude,
        longitude: body.longitude,
        service_radius_km: body.service_radius_km || 25,
        is_active: body.is_active || false
      })
      .select()
      .single();

    if (error) throw error;

    const ipAddress = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown';
    await supabase.rpc('log_admin_action', {
      p_admin_id: gate.user.id,
      p_action_type: 'config_city_created',
      p_target_type: 'city',
      p_target_id: data.id,
      p_target_name: `City: ${body.name}`,
      p_old_value: null,
      p_new_value: { name: body.name, slug: body.slug, is_active: body.is_active },
      p_reason: 'Created new city configuration',
      p_ip_address: ipAddress
    });

    return createResponse({ city: data }, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
