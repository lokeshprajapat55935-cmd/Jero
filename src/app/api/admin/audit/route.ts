import { createClient } from '@/lib/supabase/supabase-server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireAdmin } from '@/lib/auth/admin';
import { createResponse, createErrorResponse, handleApiError } from '@/lib/api-utils';

export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const gate = await requireAdmin(supabase);
    if (!gate.ok) return createErrorResponse(gate.message, gate.status);

    const admin = createAdminClient();
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');
    const actionType = searchParams.get('action_type') || 'all';
    const targetType = searchParams.get('target_type') || 'all';
    const adminId = searchParams.get('admin_id') || null;
    const dateFrom = searchParams.get('date_from') || null;
    const dateTo = searchParams.get('date_to') || null;

    let query = admin
      .from('admin_logs')
      .select(`
        *,
        admin:profiles!admin_logs_admin_id_fkey(full_name, email, admin_role)
      `, { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (actionType !== 'all') query = query.eq('action_type', actionType);
    if (targetType !== 'all') query = query.eq('target_type', targetType);
    if (adminId) query = query.eq('admin_id', adminId);
    if (dateFrom) query = query.gte('created_at', dateFrom);
    if (dateTo) query = query.lte('created_at', dateTo);

    const { data, error, count } = await query;
    if (error) throw error;

    return createResponse({ logs: data || [], count: count ?? 0 });
  } catch (error) {
    return handleApiError(error);
  }
}
