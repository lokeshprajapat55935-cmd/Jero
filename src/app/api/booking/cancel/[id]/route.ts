import { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/supabase-server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createResponse, createErrorResponse, handleApiError, getAuthUserId } from '@/lib/api-utils';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const admin = createAdminClient();
    
    const userId = await getAuthUserId(request as any, supabase);
    if (!userId) return createErrorResponse('Unauthorized', 401);

    // Fetch current booking
    const { data: booking, error: fetchErr } = await supabase
      .from('bookings')
      .select('client_id, worker_id, status, category')
      .eq('id', id)
      .single();

    if (fetchErr || !booking) return createErrorResponse('Booking not found', 404);
    if (booking.client_id !== userId) return createErrorResponse('Forbidden', 403);

    const cancellableStates = ['pending', 'broadcasting', 'accepted'];
    if (!cancellableStates.includes(booking.status)) {
      return createErrorResponse('This booking cannot be cancelled anymore. Please contact support.', 400);
    }

    // Perform cancel update
    const { error: updateErr } = await supabase
      .from('bookings')
      .update({ 
        status: 'cancelled',
        updated_at: new Date().toISOString()
      })
      .eq('id', id);

    if (updateErr) throw updateErr;

    // Log to timeline
    await supabase.from('booking_timeline').insert({
      booking_id: id,
      status: 'cancelled',
      reason: 'Cancelled by customer',
      created_by: userId,
    });

    // Cancel dispatch requests if broadcasting
    if (booking.status === 'broadcasting' || booking.status === 'pending') {
      await admin.from('dispatch_requests')
        .update({ status: 'cancelled' })
        .eq('booking_id', id)
        .in('status', ['searching']);
    }

    // Notify worker if already accepted
    if (booking.worker_id) {
      await admin.from('notifications').insert({
        user_id: booking.worker_id,
        type: 'booking_update',
        title: 'Booking Cancelled',
        content: `The customer has cancelled the booking for ${booking.category}.`,
        link_url: '/worker/jobs',
      });
    }

    return createResponse({ success: true, message: 'Booking cancelled successfully' });
  } catch (error) {
    return handleApiError(error);
  }
}
