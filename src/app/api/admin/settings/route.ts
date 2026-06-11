import { createClient } from '@/lib/supabase/supabase-server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireAdmin } from '@/lib/auth/admin';
import { createResponse, createErrorResponse, handleApiError } from '@/lib/api-utils';
import { z } from 'zod';

const updateSchema = z.object({
  key: z.string().min(1),
  value: z.string(),
  reason: z.string().min(3).optional(),
});

export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const gate = await requireAdmin(supabase);
    if (!gate.ok) return createErrorResponse(gate.message, gate.status);

    const admin = createAdminClient();
    const { data, error } = await admin
      .from('platform_config')
      .select('key, value, description')
      .order('key');

    if (error) throw error;
    return createResponse({ settings: data || [] });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const supabase = await createClient();
    // Settings changes require super_admin or finance_admin
    const gate = await requireAdmin(supabase);
    if (!gate.ok) return createErrorResponse(gate.message, gate.status);

    if (gate.adminRole !== 'super_admin' && gate.adminRole !== 'finance_admin') {
      return createErrorResponse('Settings updates require super_admin or finance_admin role', 403);
    }

    const body = updateSchema.parse(await request.json());
    const admin = createAdminClient();

    // Get old value first for audit log
    const { data: oldSetting } = await admin
      .from('platform_config')
      .select('value')
      .eq('key', body.key)
      .maybeSingle();

    const { data: updated, error } = await admin
      .from('platform_config')
      .update({ value: body.value })
      .eq('key', body.key)
      .select()
      .maybeSingle();

    if (error) throw error;
    if (!updated) return createErrorResponse(`Setting '${body.key}' not found`, 404);

    await admin.rpc('log_admin_action', {
      p_admin_id: gate.user.id,
      p_action_type: 'settings_updated',
      p_target_type: 'settings',
      p_target_id: body.key,
      p_target_name: body.key,
      p_old_value: { value: oldSetting?.value },
      p_new_value: { value: body.value },
      p_reason: body.reason || `Updated platform config: ${body.key}`,
      p_ip_address: request.headers.get('x-forwarded-for') || 'unknown',
    });

    return createResponse({ setting: updated });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return createErrorResponse('Invalid payload', 400, error.flatten().fieldErrors);
    }
    return handleApiError(error);
  }
}
