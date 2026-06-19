import { createClient } from '@/lib/supabase/supabase-server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createResponse, createErrorResponse, handleApiError } from '@/lib/api-utils';
import { requireAdmin } from '@/lib/auth/admin';
import { z } from 'zod';

const adminBookingSchema = z.object({
  booking_id: z.string().uuid(),
  status: z.enum([
    'pending', 'broadcasting', 'accepted', 'worker_arriving', 'en_route', 'work_started',
    'started', 'work_completed', 'work_completed_pending_otp', 'awaiting_item_approval', 
    'item_approved', 'otp_generated', 'otp_verified', 'awaiting_payment', 
    'payment_processing', 'payment_verified', 'completed', 'cancelled', 'disputed',
  ]),
  reason: z.string().max(500).optional(),
});

const reassignSchema = z.object({
  booking_id: z.string().uuid(),
  new_worker_id: z.string().uuid(),
  reason: z.string().min(1).max(500),
});

const cancelSchema = z.object({
  booking_id: z.string().uuid(),
  reason: z.string().min(1).max(500),
});

const ADMIN_BOOKING_SELECT = `
  *,
  worker:workers(id, category, profile:profiles(full_name, phone, avatar_url)),
  client:clients(id, profile:profiles(full_name, phone, avatar_url)),
  timeline:booking_timeline(*)
`;

export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const gate = await requireAdmin(supabase);
    if (!gate.ok) return createErrorResponse(gate.message, gate.status);

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const status = searchParams.get('status');
    const category = searchParams.get('category');
    const limit = searchParams.get('limit') ? parseInt(searchParams.get('limit')!) : 100;
    const offset = searchParams.get('offset') ? parseInt(searchParams.get('offset')!) : 0;

    const admin = createAdminClient();

    if (id) {
      const { data, error } = await admin
        .from('bookings')
        .select(ADMIN_BOOKING_SELECT)
        .eq('id', id)
        .maybeSingle();
      if (error) throw error;
      if (!data) return createErrorResponse('Booking not found', 404);
      return createResponse({ booking: data });
    }

    let query = admin
      .from('bookings')
      .select(ADMIN_BOOKING_SELECT)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (status) query = query.eq('status', status);
    if (category) query = query.eq('category', category);

    const { data, error } = await query;
    if (error) throw error;
    return createResponse({ bookings: data ?? [] });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const supabase = await createClient();
    const gate = await requireAdmin(supabase);
    if (!gate.ok) return createErrorResponse(gate.message, gate.status);

    const body = await request.json();
    const validated = adminBookingSchema.parse(body);

    const admin = createAdminClient();
    const { data, error } = await admin
      .from('bookings')
      .update({ status: validated.status, updated_at: new Date().toISOString() })
      .eq('id', validated.booking_id)
      .select('id, client_id, worker_id, category')
      .single();

    if (error) throw error;

    const ipAddress = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown';

    await admin.from('booking_timeline').insert({
      booking_id: validated.booking_id,
      status: validated.status,
      reason: validated.reason || 'Updated by admin',
      created_by: gate.user.id,
    });

    const notificationsToInsert: any[] = [
      {
        user_id: data.client_id,
        type: 'booking_update',
        title: `Booking ${validated.status.replace(/_/g, ' ')}`,
        content: `Your booking for ${data.category} has been updated to ${validated.status.replace(/_/g, ' ')} by administration.`,
        link_url: '/activity',
        metadata: { booking_id: data.id, status: validated.status, updated_by: 'admin' },
      }
    ];

    if (data.worker_id) {
      notificationsToInsert.push({
        user_id: data.worker_id,
        type: 'booking_update',
        title: `Booking ${validated.status.replace(/_/g, ' ')}`,
        content: `Your job for ${data.category} has been updated to ${validated.status.replace(/_/g, ' ')} by administration.`,
        link_url: '/worker/jobs',
        metadata: { booking_id: data.id, status: validated.status, updated_by: 'admin' },
      });
    }

    await admin.from('notifications').insert(notificationsToInsert);

    await admin.rpc('log_admin_action', {
      p_admin_id: gate.user.id,
      p_action_type: 'booking_status_update',
      p_target_type: 'booking',
      p_target_id: data.id,
      p_target_name: `${data.category} booking`,
      p_old_value: null,
      p_new_value: { status: validated.status },
      p_reason: validated.reason || 'Status override',
      p_ip_address: ipAddress
    });

    return createResponse(data);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return createErrorResponse('Validation error', 400, error.flatten().fieldErrors);
    }
    return handleApiError(error);
  }
}

/**
 * PUT /api/admin/bookings
 * Reassign a booking to a different approved worker.
 */
export async function PUT(request: Request) {
  try {
    const supabase = await createClient();
    const gate = await requireAdmin(supabase);
    if (!gate.ok) return createErrorResponse(gate.message, gate.status);

    const body = await request.json();
    const validated = reassignSchema.parse(body);
    const admin = createAdminClient();

    const { data: booking, error: fetchErr } = await admin
      .from('bookings')
      .select('id, client_id, worker_id, category, status')
      .eq('id', validated.booking_id)
      .maybeSingle();

    if (fetchErr || !booking) return createErrorResponse('Booking not found.', 404);
    if (['completed', 'cancelled', 'disputed'].includes(booking.status)) {
      return createErrorResponse(`Cannot reassign a ${booking.status} booking.`, 400);
    }

    const ipAddress = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown';

    const { data: newWorker } = await admin
      .from('workers')
      .select('id, category, profile:profiles(full_name)')
      .eq('id', validated.new_worker_id)
      .eq('status', 'approved')
      .maybeSingle();

    if (!newWorker) return createErrorResponse('Target worker not found or not approved.', 400);

    const oldWorkerId = booking.worker_id;

    const { error: updateErr } = await admin
      .from('bookings')
      .update({ worker_id: validated.new_worker_id, status: 'accepted', updated_at: new Date().toISOString() })
      .eq('id', validated.booking_id);

    if (updateErr) throw updateErr;

    await admin.from('active_bookings').upsert(
      { booking_id: validated.booking_id, worker_id: validated.new_worker_id, client_id: booking.client_id, status: 'accepted' },
      { onConflict: 'booking_id' }
    );

    await admin.from('booking_timeline').insert({
      booking_id: validated.booking_id,
      status: 'accepted',
      reason: `Reassigned to new worker by admin. Reason: ${validated.reason}`,
      created_by: gate.user.id,
    });

    const newWorkerProfile = (newWorker as any).profile;
    const notifications: any[] = [
      {
        user_id: booking.client_id,
        type: 'booking_update',
        title: 'Worker Reassigned',
        content: `Your ${booking.category} booking has been reassigned to ${newWorkerProfile?.full_name ?? 'a new professional'}.`,
        link_url: `/booking/${validated.booking_id}`,
        metadata: { booking_id: validated.booking_id },
      },
      {
        user_id: validated.new_worker_id,
        type: 'booking_request',
        title: 'Job Assigned to You',
        content: `An admin has assigned you a ${booking.category} job.`,
        link_url: `/worker/jobs/${validated.booking_id}`,
        metadata: { booking_id: validated.booking_id },
      },
    ];

    if (oldWorkerId && oldWorkerId !== validated.new_worker_id) {
      notifications.push({
        user_id: oldWorkerId,
        type: 'booking_update',
        title: 'Job Reassigned',
        content: `Your ${booking.category} job has been reassigned by administration.`,
        link_url: '/worker/jobs',
        metadata: { booking_id: validated.booking_id },
      });
      await admin.from('active_bookings').delete().eq('booking_id', validated.booking_id).eq('worker_id', oldWorkerId);
      await admin.from('worker_availability').update({ status: 'available', current_booking_id: null }).eq('worker_id', oldWorkerId);
    }

    await admin.from('notifications').insert(notifications);

    await admin.rpc('log_admin_action', {
      p_admin_id: gate.user.id,
      p_action_type: 'booking_reassign',
      p_target_type: 'booking',
      p_target_id: validated.booking_id,
      p_target_name: `${booking.category} booking`,
      p_old_value: { worker_id: oldWorkerId },
      p_new_value: { worker_id: validated.new_worker_id },
      p_reason: validated.reason,
      p_ip_address: ipAddress
    });

    return createResponse({ booking_id: validated.booking_id, new_worker_id: validated.new_worker_id });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return createErrorResponse('Validation error', 400, error.flatten().fieldErrors);
    }
    return handleApiError(error);
  }
}

/**
 * DELETE /api/admin/bookings
 * Admin force-cancel a booking.
 */
export async function DELETE(request: Request) {
  try {
    const supabase = await createClient();
    const gate = await requireAdmin(supabase);
    if (!gate.ok) return createErrorResponse(gate.message, gate.status);

    const body = await request.json();
    const validated = cancelSchema.parse(body);
    const admin = createAdminClient();

    const { data: booking, error: fetchErr } = await admin
      .from('bookings')
      .select('id, client_id, worker_id, category, status')
      .eq('id', validated.booking_id)
      .maybeSingle();

    if (fetchErr || !booking) return createErrorResponse('Booking not found.', 404);
    if (booking.status === 'completed') return createErrorResponse('Cannot cancel a completed booking.', 400);
    if (booking.status === 'cancelled') return createErrorResponse('Booking is already cancelled.', 400);

    const ipAddress = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown';

    const { error: cancelErr } = await admin
      .from('bookings')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('id', validated.booking_id);

    if (cancelErr) throw cancelErr;

    await admin.from('active_bookings').delete().eq('booking_id', validated.booking_id);

    if (booking.worker_id) {
      await admin.from('worker_availability')
        .update({ status: 'available', current_booking_id: null })
        .eq('worker_id', booking.worker_id);
    }

    await admin.from('dispatch_requests')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('booking_id', validated.booking_id);

    await admin.from('booking_timeline').insert({
      booking_id: validated.booking_id,
      status: 'cancelled',
      reason: `Cancelled by admin: ${validated.reason}`,
      created_by: gate.user.id,
    });

    const notifications: any[] = [
      {
        user_id: booking.client_id,
        type: 'booking_update',
        title: 'Booking Cancelled',
        content: `Your ${booking.category} booking has been cancelled by administration. Reason: ${validated.reason}`,
        link_url: '/activity',
        metadata: { booking_id: validated.booking_id },
      },
    ];
    if (booking.worker_id) {
      notifications.push({
        user_id: booking.worker_id,
        type: 'booking_update',
        title: 'Job Cancelled',
        content: `Your ${booking.category} job has been cancelled by administration.`,
        link_url: '/worker/jobs',
        metadata: { booking_id: validated.booking_id },
      });
    }
    await admin.from('notifications').insert(notifications);

    await admin.rpc('log_admin_action', {
      p_admin_id: gate.user.id,
      p_action_type: 'booking_cancel',
      p_target_type: 'booking',
      p_target_id: validated.booking_id,
      p_target_name: `${booking.category} booking`,
      p_old_value: null,
      p_new_value: { status: 'cancelled' },
      p_reason: validated.reason,
      p_ip_address: ipAddress
    });

    return createResponse({ booking_id: validated.booking_id, status: 'cancelled' });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return createErrorResponse('Validation error', 400, error.flatten().fieldErrors);
    }
    return handleApiError(error);
  }
}