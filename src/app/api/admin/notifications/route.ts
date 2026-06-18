import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAdminSession } from '@/lib/admin/auth';
import { fcmService } from '@/lib/notifications/fcm';

export async function POST(request: NextRequest) {
  try {
    // 1. Validate Admin Session
    const session = await getAdminSession();
    if (!session || session.role !== 'admin' || session.admin_role !== 'super_admin') {
      return NextResponse.json({ error: 'Unauthorized. Super Admin access required.' }, { status: 403 });
    }

    const { target_type, target_user_id, title, message, notification_type } = await request.json();

    if (!target_type || !title || !message) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const supabase = createAdminClient();
    let userIds: string[] = [];

    // 2. Fetch Target Users
    if (target_type === 'specific_user' && target_user_id) {
      userIds = [target_user_id];
    } else if (target_type === 'all_clients' || target_type === 'all_customers') {
      // Fetch all client IDs
      const { data } = await supabase.from('profiles').select('id').eq('role', 'client');
      userIds = data?.map(p => p.id) || [];
    } else if (target_type === 'all_workers') {
      // Fetch all worker IDs
      const { data } = await supabase.from('profiles').select('id').eq('role', 'worker');
      userIds = data?.map(p => p.id) || [];
    } else if (target_type === 'all_users') {
      const { data } = await supabase.from('profiles').select('id').in('role', ['client', 'worker']);
      userIds = data?.map(p => p.id) || [];
    } else {
      return NextResponse.json({ error: 'Invalid target type' }, { status: 400 });
    }

    if (userIds.length === 0) {
      return NextResponse.json({ error: 'No users found for the specified target' }, { status: 404 });
    }

    let successCount = 0;

    // 3. Dispatch Push Notifications
    // In a real massive production system, this would be queued (e.g. SQS, Redis).
    // For this scope, we process in batches of 50 to avoid timeout.
    const BATCH_SIZE = 50;
    for (let i = 0; i < userIds.length; i += BATCH_SIZE) {
      const batch = userIds.slice(i, i + BATCH_SIZE);
      const pushPromises = batch.map(userId => 
        fcmService.sendPushNotification(userId, { title, body: message })
      );
      
      const results = await Promise.all(pushPromises);
      successCount += results.filter(r => r.success).length;
    }

    // 4. Log in admin_notifications (Audit & History)
    const { data: logEntry, error: logError } = await supabase.from('admin_notifications').insert({
      sent_by: session.admin_id,
      target_type: target_type === 'all_customers' ? 'all_clients' : target_type,
      target_user_id: target_user_id || null,
      title,
      message,
      notification_type: notification_type || 'announcement',
      sent_count: userIds.length,
    }).select().single();

    if (logError) {
      console.error('Failed to log admin_notification:', logError.message);
    }

    // 5. Audit Log the action
    const { error: auditError } = await supabase.from('admin_logs').insert({
      admin_id: session.admin_id,
      action_type: 'send_global_notification',
      target_type: target_type,
      new_value: { title, target_count: userIds.length, success_push_count: successCount },
      reason: 'Admin broadcast message',
    });

    if (auditError) console.error('Audit log failed', auditError.message);

    return NextResponse.json({ 
      success: true, 
      message: 'Notifications dispatched',
      totalTargets: userIds.length,
      pushSuccessCount: successCount
    });

  } catch (error: any) {
    console.error('Admin Notification Error:', error.message);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
