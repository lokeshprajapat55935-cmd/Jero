import { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/supabase-server';
import { getAuthUserId } from '@/lib/api-utils';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const userId = await getAuthUserId(request, supabase);
    
    if (!userId) {
      return Response.json({ success: false, data: null, error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');

    const { data: notifications, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error("Supabase notifications fetch error:", error);
      return Response.json({ success: false, data: null, error: 'Failed to fetch notifications' }, { status: 200 });
    }

    return Response.json({ success: true, data: { notifications: notifications || [] }, error: null }, { status: 200 });
  } catch (err) {
    console.error("Notifications API crash:", err);
    return Response.json({ success: false, data: null, error: 'Internal Server Error' }, { status: 200 });
  }
}

export async function POST(request: NextRequest) {
  try {
    // Note: Ideally, this endpoint would be protected by admin API keys or service role keys.
    // For now, ensuring basic auth if it's sent by the user, but system tasks can use service_role.
    const supabase = await createClient();
    const body = await request.json().catch(() => null);
    
    if (!body || !body.user_id || !body.title) {
      return Response.json({ success: false, data: null, error: 'Invalid payload' }, { status: 400 });
    }

    const notification = {
      user_id: body.user_id,
      title: body.title,
      content: body.message || body.content || '', // Handle mapping message to content for the DB schema
      type: body.type || 'system',
      link_url: body.action_url || body.link_url || null,
      is_read: false,
      created_at: new Date().toISOString()
    };

    const { data, error } = await supabase
      .from('notifications')
      .insert(notification)
      .select('*')
      .single();

    if (error) {
      console.error("Supabase notification create error:", error);
      return Response.json({ success: false, data: null, error: 'Failed to create notification' }, { status: 200 });
    }

    return Response.json({ success: true, data: { notification: data }, error: null }, { status: 201 });
  } catch (err) {
    console.error("Notifications API crash:", err);
    return Response.json({ success: false, data: null, error: 'Internal Server Error' }, { status: 200 });
  }
}
