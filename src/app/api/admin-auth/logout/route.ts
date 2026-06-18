import { NextResponse } from 'next/server';
import { clearAdminSession, getAdminSession } from '@/lib/admin/auth';
import { createAdminClient } from '@/lib/supabase/admin';

export async function POST() {
  try {
    const session = await getAdminSession();
    
    if (session) {
      // Log logout event
      const supabase = createAdminClient();
      try {
        await supabase.from('admin_logs').insert({
          admin_id: session.admin_id,
          action_type: 'admin_logout',
          reason: 'User initiated logout',
        });
      } catch (err) {
        console.error('Failed to log admin logout:', err);
      }
    }

    await clearAdminSession();
    return NextResponse.json({ success: true, redirectUrl: '/admin-login' });
  } catch (error) {
    console.error('Logout error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
