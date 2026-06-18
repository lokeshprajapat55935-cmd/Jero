import type { SupabaseClient } from '@supabase/supabase-js';
import type { AdminRole } from '@/types';
import { getAdminSession } from '@/lib/admin/auth';
import { createAdminClient } from '@/lib/supabase/admin';

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
 * Require strict super_admin access via isolated admin session.
 * Standard Supabase Auth is ignored to enforce complete isolation.
 */
export async function requireAdmin(
  supabase?: SupabaseClient
): Promise<AdminGateResult | AdminGateDenied> {
  try {
    const adminSession = await getAdminSession();
    
    if (adminSession && adminSession.role === 'admin' && adminSession.admin_role === 'super_admin') {
      const adminDb = createAdminClient();
      
      // Validate session against database for real-time revocation
      const { data: profile } = await adminDb
        .from('profiles')
        .select('role, admin_role')
        .eq('id', adminSession.admin_id)
        .maybeSingle();

      if (profile?.role === 'admin' && profile?.admin_role === 'super_admin') {
        return { ok: true, user: { id: adminSession.admin_id }, adminRole: 'super_admin' };
      }
      
      console.log('requireAdmin failed. profile:', profile);
    }
    
    return { ok: false, status: 403, message: 'Forbidden: Strict Super Admin access required' };
  } catch (error) {
    console.error('[requireAdmin] Isolated session check failed:', error);
    return { ok: false, status: 401, message: 'Unauthorized' };
  }
}