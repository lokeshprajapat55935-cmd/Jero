import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/supabase-server';
import { requireAdmin } from '@/lib/auth/admin';
import { createResponse, createErrorResponse, handleApiError } from '@/lib/api-utils';

export async function GET(request: Request) {
  try {
    const userSupabase = await createClient();
    const gate = await requireAdmin(userSupabase);
    if (!gate.ok) return createErrorResponse(gate.message, gate.status);

    const supabase = await createAdminClient();
    const { data, error } = await supabase
      .from('states')
      .select('*')
      .order('name', { ascending: true });

    if (error) throw error;
    return createResponse({ states: data || [] });
  } catch (error) {
    return handleApiError(error);
  }
}
