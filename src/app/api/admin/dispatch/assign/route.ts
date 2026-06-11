import { createClient } from '@/lib/supabase/supabase-server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireAdmin } from '@/lib/auth/admin';
import { createResponse, createErrorResponse, handleApiError } from '@/lib/api-utils';
import { z } from 'zod';

const assignSchema = z.object({
  booking_id: z.string().uuid(),
  worker_id: z.string().uuid(),
  reason: z.string().min(1).max(500),
});

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const gate = await requireAdmin(supabase);
    if (!gate.ok) return createErrorResponse(gate.message, gate.status);

    // Support Execs are restricted from force-assignment
    if (gate.adminRole === 'support_admin') {
      return createErrorResponse('Forbidden: Support Executives are not allowed to force-assign bookings.', 403);
    }

    const body = await request.json();
    const { booking_id, worker_id, reason } = assignSchema.parse(body);

    const admin = createAdminClient();

    try {
      // 1. Try running RPC
      const { data, error } = await admin.rpc('admin_force_assign_booking', {
        p_booking_id: booking_id,
        p_worker_id: worker_id,
        p_admin_id: gate.user.id,
        p_reason: reason,
      });

      if (error) throw error;

      return createResponse({ success: true, ...data });
    } catch (rpcErr) {
      console.warn('RPC admin_force_assign_booking failed, using manual database fallback.', rpcErr);

      // 2. Fallback step-by-step transaction
      // A. Fetch current booking details
      const { data: booking, error: fetchErr } = await admin
        .from('bookings')
        .select('id, status, worker_id, client_id, category')
        .eq('id', booking_id)
        .maybeSingle();

      if (fetchErr || !booking) {
        return createErrorResponse('Booking not found.', 404);
      }

      if (['completed', 'cancelled', 'disputed'].includes(booking.status)) {
        return createErrorResponse(`Cannot assign worker to a ${booking.status} booking.`, 400);
      }

      // Check if target worker is approved
      const { data: worker, error: workerErr } = await admin
        .from('workers')
        .select('id, status')
        .eq('id', worker_id)
        .eq('status', 'approved')
        .maybeSingle();

      if (workerErr || !worker) {
        return createErrorResponse('Target worker not found or is not approved.', 400);
      }

      const oldWorkerId = booking.worker_id;
      const now = new Date().toISOString();

      // B. If booking already has worker, clear old assignment
      if (oldWorkerId) {
        await admin.from('active_bookings').delete().eq('booking_id', booking_id);
        await admin
          .from('worker_availability')
          .update({ status: 'online', current_booking_id: null, last_active_at: now })
          .eq('worker_id', oldWorkerId);
      }

      // C. Check if target worker already has an active booking
      const { data: targetActive } = await admin
        .from('active_bookings')
        .select('booking_id')
        .eq('worker_id', worker_id)
        .maybeSingle();

      if (targetActive && targetActive.booking_id !== booking_id) {
        return createErrorResponse('Target worker is already busy with another active booking.', 400);
      }

      // D. Update Booking status and worker
      const { error: bookingUpdateErr } = await admin
        .from('bookings')
        .update({
          worker_id,
          status: 'accepted',
          updated_at: now,
        })
        .eq('id', booking_id);

      if (bookingUpdateErr) throw bookingUpdateErr;

      // E. Lock in active_bookings
      await admin.from('active_bookings').upsert(
        {
          booking_id,
          worker_id,
          client_id: booking.client_id,
          status: 'accepted',
          created_at: now,
        },
        { onConflict: 'booking_id' }
      );

      // F. Update worker availability to busy
      await admin.from('worker_availability').upsert(
        {
          worker_id,
          status: 'busy',
          current_booking_id: booking_id,
          last_active_at: now,
        },
        { onConflict: 'worker_id' }
      );

      // G. Update dispatch request
      await admin
        .from('dispatch_requests')
        .update({
          status: 'accepted',
          current_worker_id: worker_id,
          updated_at: now,
        })
        .eq('booking_id', booking_id);

      // H. Create conversation
      await admin.from('conversations').insert({
        booking_id,
        participant_ids: [booking.client_id, worker_id],
        last_message_at: now,
      });

      // I. Log to booking timeline
      await admin.from('booking_timeline').insert({
        booking_id,
        status: 'accepted',
        reason: `Force-assigned by admin: ${reason}`,
        created_by: gate.user.id,
      });

      // J. Create notifications for client and workers
      const notifications = [
        {
          user_id: booking.client_id,
          type: 'booking_update',
          title: 'Professional Assigned',
          content: `Administration has assigned a professional to your ${booking.category} booking.`,
          link_url: `/booking/${booking_id}`,
          metadata: { booking_id },
        },
        {
          user_id: worker_id,
          type: 'booking_request',
          title: 'Job Assigned to You',
          content: `An admin has assigned you a ${booking.category} job.`,
          link_url: `/worker/jobs/${booking_id}`,
          metadata: { booking_id },
        },
      ];
      if (oldWorkerId && oldWorkerId !== worker_id) {
        notifications.push({
          user_id: oldWorkerId,
          type: 'booking_update',
          title: 'Job Reassigned',
          content: `Your ${booking.category} job has been reassigned to another professional by administration.`,
          link_url: '/worker/jobs',
          metadata: { booking_id },
        });
      }
      await admin.from('notifications').insert(notifications);

      // K. Log administrative action
      await admin.from('admin_logs').insert({
        admin_id: gate.user.id,
        action_type: 'booking_force_assigned',
        target_type: 'booking',
        target_id: booking_id,
        target_name: `Booking #${booking_id.substring(0, 8)}`,
        old_value: { worker_id: oldWorkerId },
        new_value: { worker_id },
        reason,
      });

      return createResponse({ success: true });
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return createErrorResponse('Validation error', 400, error.flatten().fieldErrors);
    }
    return handleApiError(error);
  }
}
