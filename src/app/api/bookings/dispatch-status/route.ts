import { createClient } from '@/lib/supabase/supabase-server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createResponse, createErrorResponse, handleApiError, getAuthUserId } from '@/lib/api-utils';
import { z } from 'zod';

const statusSchema = z.object({
  booking_id: z.string().uuid(),
});

export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const userId = await getAuthUserId(request as any, supabase);
    if (!userId) return createErrorResponse('Unauthorized', 401);

    const { searchParams } = new URL(request.url);
    const bookingId = searchParams.get('booking_id');
    if (!bookingId) return createErrorResponse('booking_id is required', 400);

    const validated = statusSchema.parse({ booking_id: bookingId });
    const admin = createAdminClient();

    // Fetch dispatch request
    let { data: dispatch, error: dErr } = await admin
      .from('dispatch_requests')
      .select('*')
      .eq('booking_id', validated.booking_id)
      .maybeSingle();

    if (dErr) throw dErr;

    // Fetch booking
    let { data: booking, error: bErr } = await admin
      .from('bookings')
      .select('*')
      .eq('id', validated.booking_id)
      .maybeSingle();

    if (bErr) throw bErr;
    if (!booking) {
      return createErrorResponse('Booking not found', 404);
    }

    if (!dispatch) {
      const { data: newDispatch, error: insErr } = await admin
        .from('dispatch_requests')
        .insert({
          booking_id: validated.booking_id,
          status: 'searching',
          max_radius_km: 15.0,
          current_radius_km: 5.0,
        })
        .select('*')
        .single();
      if (insErr) throw insErr;
      dispatch = newDispatch;
    }

    if (dispatch.status !== 'searching' || booking.status !== 'broadcasting') {
      return createResponse({
        status: dispatch.status,
        booking,
        dispatch,
        time_left_seconds: 0,
      });
    }

    const now = new Date();
    const createdAt = new Date(dispatch.created_at);
    const updatedAt = new Date(dispatch.updated_at);
    const elapsedSeconds = (now.getTime() - createdAt.getTime()) / 1000;
    const lastUpdateSeconds = (now.getTime() - updatedAt.getTime()) / 1000;

    // Check overall timeout (300 seconds)
    if (elapsedSeconds > 300) {
      const { data: updatedDispatch } = await admin
        .from('dispatch_requests')
        .update({ status: 'expired', updated_at: now.toISOString() })
        .eq('id', dispatch.id)
        .select('*')
        .single();

      const { data: updatedBooking } = await admin
        .from('bookings')
        .update({ status: 'no_worker_available', updated_at: now.toISOString() })
        .eq('id', validated.booking_id)
        .select('*')
        .single();

      await admin.from('booking_timeline').insert({
        booking_id: validated.booking_id,
        status: 'no_worker_available',
        reason: 'Dispatch request timed out. No available professionals nearby.',
        created_by: booking.client_id,
      });

      // Notify workers
      const { data: attempts } = await admin
        .from('dispatch_attempts')
        .select('worker_id')
        .eq('dispatch_request_id', dispatch.id);

      if (attempts && attempts.length > 0) {
        const notifications = attempts.map(da => ({
          user_id: da.worker_id,
          type: 'booking_request_cancelled',
          title: 'Request Expired',
          content: 'Booking request timed out without acceptance.',
          link_url: '',
          metadata: { booking_id: validated.booking_id },
        }));
        await admin.from('notifications').insert(notifications);
      }

      return createResponse({
        status: 'expired',
        booking: updatedBooking,
        dispatch: updatedDispatch,
        time_left_seconds: 0,
      });
    }

    // Check step timeout for radius expansion (30 seconds)
    if (lastUpdateSeconds >= 30 && dispatch.current_radius_km < dispatch.max_radius_km) {
      const nextRadius = dispatch.current_radius_km + 5.0;

      const { data: updatedDispatch } = await admin
        .from('dispatch_requests')
        .update({ current_radius_km: nextRadius, updated_at: now.toISOString() })
        .eq('id', dispatch.id)
        .select('*')
        .single();
      
      dispatch = updatedDispatch;

      if (booking.latitude !== null && booking.longitude !== null) {
        const { data: attempts } = await admin
          .from('dispatch_attempts')
          .select('worker_id')
          .eq('dispatch_request_id', dispatch.id);

        const notifiedIds = attempts ? attempts.map(da => da.worker_id) : [];

        const { data: nearbyWorkers } = await admin.rpc('get_nearby_dispatch_workers', {
          p_latitude: booking.latitude,
          p_longitude: booking.longitude,
          p_category: booking.category,
          p_max_distance_km: nextRadius,
          p_limit: 10,
        });

        let newWorkersCount = 0;
        if (nearbyWorkers && nearbyWorkers.length > 0) {
          for (const worker of nearbyWorkers) {
            if (!notifiedIds.includes(worker.worker_id)) {
              await admin.from('dispatch_attempts').insert({
                dispatch_request_id: dispatch.id,
                worker_id: worker.worker_id,
                status: 'sent',
              });

              await admin.from('notifications').insert({
                user_id: worker.worker_id,
                type: 'booking_request',
                title: 'New Service Request Nearby (Expanded)',
                content: `${booking.category} - ${booking.description}. Tap to accept.`,
                link_url: '/worker/dashboard',
                metadata: {
                  booking_id: booking.id,
                  category: booking.category,
                  description: booking.description,
                  expires_at: booking.expires_at,
                  distance_km: String(Math.round((worker.distance_km || 0) * 10) / 10),
                  priority: 'medium',
                },
              });
              newWorkersCount++;
            }
          }
        }

        if (newWorkersCount > 0) {
          const { data: updatedBooking } = await admin
            .from('bookings')
            .update({
              notified_worker_count: (booking.notified_worker_count || 0) + newWorkersCount,
              updated_at: now.toISOString(),
            })
            .eq('id', booking.id)
            .select('*')
            .single();
          booking = updatedBooking;
        }
      }
    }

    return createResponse({
      status: 'searching',
      booking,
      dispatch,
      time_left_seconds: Math.max(0, Math.floor(300 - elapsedSeconds)),
    });
  } catch (error) {
    return handleApiError(error);
  }
}
