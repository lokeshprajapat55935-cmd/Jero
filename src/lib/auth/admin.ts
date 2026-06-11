import type { SupabaseClient } from '@supabase/supabase-js';
import type { AdminRole } from '@/types';

export interface AdminGateResult {
  ok: true;
  user: { id: string };
  adminRole: AdminRole | null;
}

export interface AdminGateDenied {
  ok: false;
  status: 401 | 403;
  message: string;
}

/**
 * Require admin access. Optionally enforce a specific sub-role.
 * All existing admins default to 'super_admin' via DB migration.
 * 'super_admin' passes all sub-role checks.
 */
export async function requireAdmin(
  supabase: SupabaseClient,
  requiredSubRole?: AdminRole
): Promise<AdminGateResult | AdminGateDenied> {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { ok: false, status: 401, message: 'Unauthorized' };
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, admin_role')
    .eq('id', user.id)
    .maybeSingle();

  if (profile?.role !== 'admin') {
    return { ok: false, status: 403, message: 'Admin access required' };
  }

  const adminRole = (profile.admin_role as AdminRole | null) ?? 'super_admin';

  // super_admin passes all sub-role checks
  if (requiredSubRole && adminRole !== 'super_admin' && adminRole !== requiredSubRole) {
    return {
      ok: false,
      status: 403,
      message: `This action requires the '${requiredSubRole}' role. Your current admin role is '${adminRole}'.`,
    };
  }

  return { ok: true, user, adminRole };
}