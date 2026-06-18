import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { config } from '@/config';
import { createResponse, getAuthUserId } from '@/lib/api-utils';
import { createAdminClient } from '@/lib/supabase/admin';

export async function POST(request: NextRequest) {
  let supabaseResponse = NextResponse.json({ success: true, message: 'Logged out successfully' });
  const appType = request.headers.get('x-zolvo-app-type') || 'customer';
  const cookieName = appType === 'worker' ? 'zolvo_worker_session' : 'zolvo_customer_session';
  
  const supabase = createServerClient(
    config.env.supabase.url!,
    config.env.supabase.anonKey!,
    {
      cookieOptions: { name: cookieName },
      cookies: {
        getAll() { return request.cookies.getAll(); },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Invalidate worker status to offline
  try {
    const userId = await getAuthUserId(request, supabase);
    if (userId) {
      const admin = createAdminClient();
      await admin
        .from('worker_availability')
        .update({ status: 'offline', last_active_at: new Date().toISOString() })
        .eq('worker_id', userId);
    }
  } catch (err) {
    console.error('Failed to set worker status offline on logout:', err);
  }

  // Invalidate Supabase session
  await supabase.auth.signOut();

  // Explicitly clear isolated Next.js custom auth/role cookies

  if (appType === 'worker') {
    supabaseResponse.cookies.delete('zolvo_worker_uid');
    supabaseResponse.cookies.delete('zolvo_worker_role');
  } else {
    supabaseResponse.cookies.delete('zolvo_customer_uid');
    supabaseResponse.cookies.delete('zolvo_customer_role');
  }

  return supabaseResponse;
}
