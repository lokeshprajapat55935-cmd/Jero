import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { config } from '@/config';
import { createResponse, getAuthUserId } from '@/lib/api-utils';
import { createAdminClient } from '@/lib/supabase/admin';

export async function POST(request: NextRequest) {
  let supabaseResponse = NextResponse.json({ success: true, message: 'Logged out successfully' });
  
  const supabase = createServerClient(
    config.env.supabase.url!,
    config.env.supabase.anonKey!,
    {
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

  // Explicitly clear Next.js custom auth/role cookies
  supabaseResponse.cookies.delete('zolvo_auth_uid');
  supabaseResponse.cookies.delete('zolvo_role');

  return supabaseResponse;
}
