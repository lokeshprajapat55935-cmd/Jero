import { createAdminClient } from '@/lib/supabase/admin';

export type AdminRole = 'super_admin' | 'operations_admin' | 'support_admin' | 'finance_admin';

/**
 * Verifies if a user has admin privileges and belongs to one of the allowed admin sub-roles.
 * Returns { authorized: boolean, profile?: any }
 */
export async function verifyAdminRole(userId: string, allowedRoles: AdminRole[]): Promise<{
  authorized: boolean;
  profile?: any;
}> {
  try {
    const admin = createAdminClient();
    const { data: profile, error } = await admin
      .from('profiles')
      .select('id, role, admin_role, full_name')
      .eq('id', userId)
      .maybeSingle();

    if (error || !profile) {
      return { authorized: false };
    }

    if (profile.role !== 'admin') {
      return { authorized: false };
    }

    const hasRole = allowedRoles.includes(profile.admin_role as AdminRole);
    if (!hasRole) {
      return { authorized: false, profile };
    }

    return { authorized: true, profile };
  } catch (error) {
    console.error('Error verifying admin role:', error);
    return { authorized: false };
  }
}
