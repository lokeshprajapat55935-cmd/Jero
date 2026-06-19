import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/supabase-server';
import { requireAdmin } from '@/lib/auth/admin';
import { createResponse, createErrorResponse, handleApiError } from '@/lib/api-utils';
import { locationService } from '@/services/location';

/**
 * GET: Get active city configuration
 * POST: Set active city
 */
export async function GET(request: Request) {
  try {
    const userSupabase = await createClient();
    const gate = await requireAdmin(userSupabase);
    if (!gate.ok) return createErrorResponse(gate.message, gate.status);

    const supabase = await createAdminClient();
    
    const { data, error } = await supabase
      .from('platform_config')
      .select('key, value')
      .in('key', ['active_city_slug', 'active_city_mode']);

    if (error) throw error;

    const config: Record<string, string> = {};
    (data || []).forEach((item: any) => {
      config[item.key] = item.value;
    });

    return createResponse({
      activeCity: config.active_city_slug || 'bhilwara',
      mode: config.active_city_mode || 'single'
    });
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * POST: Update active city
 */
export async function POST(request: Request) {
  try {
    const userSupabase = await createClient();
    const gate = await requireAdmin(userSupabase);
    if (!gate.ok) return createErrorResponse(gate.message, gate.status);

    if (gate.adminRole !== 'super_admin') {
      return createErrorResponse('Forbidden: Only Super Admins can update platform configurations', 403);
    }

    const body = await request.json();
    const supabase = await createAdminClient();

    if (!body.citySlug) {
      return createErrorResponse('citySlug is required', 400);
    }

    // Verify city exists
    const { data: cityExists } = await supabase
      .from('cities')
      .select('id, name')
      .eq('slug', body.citySlug)
      .single();

    if (!cityExists) {
      return createErrorResponse('City not found', 404);
    }

    // Update config
    const { error } = await supabase
      .from('platform_config')
      .update({ value: body.citySlug })
      .eq('key', 'active_city_slug');

    if (error) throw error;

    // Clear server location cache to force reload across endpoints
    locationService.clearServerCache();

    const ipAddress = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown';
    await supabase.rpc('log_admin_action', {
      p_admin_id: gate.user.id,
      p_action_type: 'config_active_city_update',
      p_target_type: 'settings',
      p_target_id: 'active_city_slug',
      p_target_name: 'Active City Configuration',
      p_old_value: null,
      p_new_value: { citySlug: body.citySlug, cityName: cityExists.name },
      p_reason: `Switched active city to ${cityExists.name}`,
      p_ip_address: ipAddress
    });

    return createResponse({
      message: `Active city changed to ${cityExists.name}`,
      activeCity: body.citySlug
    });
  } catch (error) {
    return handleApiError(error);
  }
}
