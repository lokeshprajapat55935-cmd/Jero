import { createClient } from '@/lib/supabase/supabase-server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireAdmin } from '@/lib/auth/admin';
import { createResponse, createErrorResponse, handleApiError } from '@/lib/api-utils';
import { z } from 'zod';

const broadcastSchema = z.object({
  target_type: z.enum(['all_workers', 'all_clients', 'all_users', 'city', 'specific_user']),
  target_city_id: z.string().uuid().optional(),
  target_user_id: z.string().uuid().optional(),
  title: z.string().min(3).max(100),
  message: z.string().min(5).max(500),
  notification_type: z.enum(['info', 'warning', 'announcement', 'urgent']).default('info'),
});

export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const gate = await requireAdmin(supabase);
    if (!gate.ok) return createErrorResponse(gate.message, gate.status);

    const admin = createAdminClient();
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '30');
    const offset = parseInt(searchParams.get('offset') || '0');

    const { data, error, count } = await admin
      .from('admin_notifications')
      .select(`
        *,
        sender:profiles!admin_notifications_sent_by_fkey(full_name, email)
      `, { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;
    return createResponse({ notifications: data || [], count: count ?? 0 });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const gate = await requireAdmin(supabase);
    if (!gate.ok) return createErrorResponse(gate.message, gate.status);

    const body = broadcastSchema.parse(await request.json());
    const admin = createAdminClient();

    // Collect target user IDs
    let targetUserIds: string[] = [];

    if (body.target_type === 'all_workers') {
      const { data } = await admin.from('profiles').select('id').eq('role', 'worker');
      targetUserIds = (data || []).map((p: any) => p.id);
    } else if (body.target_type === 'all_clients') {
      const { data } = await admin.from('profiles').select('id').eq('role', 'client');
      targetUserIds = (data || []).map((p: any) => p.id);
    } else if (body.target_type === 'all_users') {
      const { data } = await admin.from('profiles').select('id').not('role', 'eq', 'admin');
      targetUserIds = (data || []).map((p: any) => p.id);
    } else if (body.target_type === 'city' && body.target_city_id) {
      // Workers in a city
      const { data: workers } = await admin
        .from('workers')
        .select('id')
        .eq('city_id', body.target_city_id);
      const workerIds = (workers || []).map((w: any) => w.id);
      // Clients in a city
      const { data: clients } = await admin
        .from('clients')
        .select('id')
        .eq('city_id', body.target_city_id);
      const clientIds = (clients || []).map((c: any) => c.id);
      targetUserIds = [...workerIds, ...clientIds];
    } else if (body.target_type === 'specific_user' && body.target_user_id) {
      targetUserIds = [body.target_user_id];
    }

    // Insert notifications in bulk
    if (targetUserIds.length > 0) {
      const notifications = targetUserIds.map((userId) => ({
        user_id: userId,
        type: 'admin_broadcast',
        title: body.title,
        content: body.message,
        is_read: false,
      }));

      // Insert in batches of 100 to avoid payload limits
      const chunkSize = 100;
      for (let i = 0; i < notifications.length; i += chunkSize) {
        await admin.from('notifications').insert(notifications.slice(i, i + chunkSize));
      }
    }

    // Log the broadcast
    const { data: adminNotif, error: logError } = await admin
      .from('admin_notifications')
      .insert({
        sent_by: gate.user.id,
        target_type: body.target_type,
        target_city_id: body.target_city_id || null,
        target_user_id: body.target_user_id || null,
        title: body.title,
        message: body.message,
        notification_type: body.notification_type,
        sent_count: targetUserIds.length,
      })
      .select()
      .single();

    if (logError) throw logError;

    await admin.rpc('log_admin_action', {
      p_admin_id: gate.user.id,
      p_action_type: 'notification_broadcast',
      p_target_type: 'notification',
      p_target_id: adminNotif.id,
      p_target_name: body.title,
      p_old_value: null,
      p_new_value: {
        target_type: body.target_type,
        sent_count: targetUserIds.length,
        notification_type: body.notification_type,
      },
      p_reason: body.message,
      p_ip_address: request.headers.get('x-forwarded-for') || 'unknown',
    });

    return createResponse({ success: true, sent_count: targetUserIds.length, notification: adminNotif }, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return createErrorResponse('Invalid payload', 400, error.flatten().fieldErrors);
    }
    return handleApiError(error);
  }
}
