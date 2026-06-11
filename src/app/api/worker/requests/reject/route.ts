import { createClient } from '@/lib/supabase/supabase-server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createResponse, createErrorResponse, handleApiError, getAuthUserId } from '@/lib/api-utils';
import { z } from 'zod';

const rejectSchema = z.object({
  booking_id: z.string().uuid(),
  reason: z.enum(['not_available', 'too_far', 'not_my_category', 'other']).optional().default('other'),
});

/**
 * POST /api/worker/requests/reject
 *
 * Worker explicitly rejects an incoming job request.
 * Triggers immediate redispatch to the next eligible worker.
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const userId = await getAuthUserId(request as any, supabase);
    if (!userId) return createErrorResponse('Not authenticated', 401);

    const body = await request.json();
    const validated = rejectSchema.parse(body);
    const admin = createAdminClient();

    // Must be an approved worker
    const { data: worker } = await admin
      .from('workers')
      .select('id, category, status')
      .eq('id', userId)
      .eq('status', 'approved')
      .maybeSingle();

    if (!worker) return createErrorResponse('Only approved workers can reject jobs.', 403);

    // Verify the booking is still in broadcasting state
    const { data: booking } = await admin
      .from('bookings')
      .select('id, status, category, client_id')
      .eq('id', validated.booking_id)
      .eq('status', 'broadcasting')
      .maybeSingle();

    if (!booking) {
      return createErrorResponse('This job is no longer available.', 400);
    }

    // Call the reject_dispatch_attempt RPC which handles redispatch automatically
    const { data: result, error: rpcError } = await admin.rpc('reject_dispatch_attempt', {
      p_booking_id: validated.booking_id,
      p_worker_id: userId,
      p_rejection_reason: validated.reason,
    });

    if (rpcError) throw rpcError;

    // Mark this notification as read to clear it from the worker's feed
    await admin
      .from('notifications')
      .update({ is_read: true })
      .eq('user_id', userId)
      .eq('type', 'booking_request')
      .contains('metadata', { booking_id: validated.booking_id });

    return createResponse({
      success: true,
      action: result?.action ?? 'rejected',
      booking_id: validated.booking_id,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return createErrorResponse('Validation error', 400, error.flatten().fieldErrors);
    }
    return handleApiError(error);
  }
}
