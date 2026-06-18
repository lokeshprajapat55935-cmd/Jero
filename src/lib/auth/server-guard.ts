import { createClient } from '@/lib/supabase/supabase-server';
import { createAdminClient } from '@/lib/supabase/admin';
import { ApiError } from '@/lib/api-error';
import { cookies } from 'next/headers';
import { getAdminSession } from '@/lib/admin/auth';

async function getUserIdFromCookies() {
  try {
    const cookieStore = await cookies();
    const { headers } = await import('next/headers');
    const headersList = await headers();
    const appType = headersList.get('x-zolvo-app-type') || 'customer';
    const cookieName = appType === 'worker' ? 'zolvo_worker_uid' : 'zolvo_customer_uid';

    const cookieUid = cookieStore.get(cookieName)?.value;
    if (cookieUid) {
      // Resolve Firebase UID to profile UUID if it's not a UUID
      const isUuid = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(cookieUid);
      if (!isUuid) {
        const admin = createAdminClient();
        const { data, error } = await admin
          .from('profiles')
          .select('id')
          .eq('firebase_uid', cookieUid)
          .maybeSingle();
        if (!error && data?.id) {
          return data.id;
        }
      }
      return cookieUid;
    }
  } catch (e) {
    // Ignore cookie read errors
  }
  return null;
}

/**
 * Validates that the current request has a valid user session,
 * and that the user's role is 'worker'.
 * 
 * Returns the authenticated user and their worker profile.
 * Throws an ApiError if unauthorized or forbidden.
 */
export async function requireWorker() {
  const supabase = await createClient();
  
  // 1. Check isolated admin session (Admins can act as workers in some contexts, but usually they shouldn't)
  // For now, we keep it strict: only real workers or Supabase Auth admins.
  
  let userId = await getUserIdFromCookies();
  let user: any = userId ? { id: userId } : null;

  if (!user) {
    const { data: { user: sbUser }, error: userError } = await supabase.auth.getUser();
    if (userError || !sbUser) {
      throw new ApiError(401, 'Unauthorized: Missing or invalid session');
    }
    user = sbUser;
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role, onboarded')
    .eq('id', user.id)
    .maybeSingle();

  if (profileError || !profile || profile.role !== 'worker') {
    throw new ApiError(403, 'Forbidden: Worker access required');
  }

  const { data: workerData, error: workerError } = await supabase
    .from('workers')
    .select('*')
    .eq('id', user.id)
    .maybeSingle();

  return { user, profile, workerData, admin: createAdminClient(), supabase };
}

/**
 * Validates that the current request has a valid user session,
 * and that the user's role is 'client'.
 */
export async function requireClient() {
  const supabase = await createClient();
  let userId = await getUserIdFromCookies();
  let user: any = userId ? { id: userId } : null;

  if (!user) {
    const { data: { user: sbUser }, error: userError } = await supabase.auth.getUser();
    if (userError || !sbUser) {
      throw new ApiError(401, 'Unauthorized: Missing or invalid session');
    }
    user = sbUser;
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();

  if (profileError || !profile || profile.role !== 'client') {
    throw new ApiError(403, 'Forbidden: Client access required');
  }

  return { user, profile, admin: createAdminClient() };
}

/**
 * Validates that the current request has a valid user session,
 * and that the user's role is 'admin'.
 * Supports isolated admin sessions and standard Supabase Auth.
 */
export async function requireAdmin() {
  const supabase = await createClient();
  
  // 1. Check isolated admin session first
  const adminSession = await getAdminSession();
  if (adminSession && adminSession.role === 'admin') {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role, admin_role')
      .eq('id', adminSession.admin_id)
      .maybeSingle();

    if (profile?.role === 'admin') {
      return { 
        user: { id: adminSession.admin_id }, 
        profile, 
        admin: createAdminClient(),
        adminRole: profile.admin_role || 'super_admin'
      };
    }
  }

  // 2. Fallback to standard session
  let userId = await getUserIdFromCookies();
  let user: any = userId ? { id: userId } : null;

  if (!user) {
    const { data: { user: sbUser }, error: userError } = await supabase.auth.getUser();
    if (userError || !sbUser) {
      throw new ApiError(401, 'Unauthorized: Missing or invalid session');
    }
    user = sbUser;
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role, admin_role')
    .eq('id', user.id)
    .maybeSingle();

  if (profileError || !profile || profile.role !== 'admin') {
    throw new ApiError(403, 'Forbidden: Admin access required');
  }

  return { 
    user, 
    profile, 
    admin: createAdminClient(),
    adminRole: profile.admin_role || 'super_admin'
  };
}
