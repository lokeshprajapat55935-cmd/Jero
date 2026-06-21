import { createClient } from '@/lib/supabase/supabase-server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createResponse, createErrorResponse, handleApiError, getAuthUserId } from '@/lib/api-utils';

export const dynamic = 'force-dynamic';

/**
 * GET /api/worker/requests
 *
 * Returns the live list of incoming broadcast job requests for the authenticated worker.
 *
 * Strategy:
 * 1. Auth-check: must be a worker with status = 'approved'
 * 2. Fetch unread `booking_request` notifications for this worker from the last 20 minutes
 * 3. Join the full booking row for each notification
 * 4. Filter out bookings that are no longer `broadcasting` (already taken by someone else)
 * 5. Return typed IncomingJobRequest[] — safe, no raw DB errors exposed
 */
export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const userId = await getAuthUserId(request as any, supabase);
    console.log(`[DEBUG-WORKER] /api/worker/requests -> userId resolved: ${userId}`);
    if (!userId) return createErrorResponse('Unauthorized', 401);

    const admin = createAdminClient();

    // Guard: worker must be approved
    const { data: worker, error: workerErr } = await admin
      .from('workers')
      .select('id, category, status')
      .eq('id', userId)
      .eq('status', 'approved')
      .maybeSingle();

    console.log('[DEBUG /api/worker/requests] userId:', userId, 'worker:', worker, 'error:', workerErr);

    if (!worker) {
      return createErrorResponse('Only approved workers can access job requests.', 403);
    }

    // Guard: worker must be online
    const { data: availability } = await admin
      .from('worker_availability')
      .select('status')
      .eq('worker_id', userId)
      .maybeSingle();

    const workerStatus = availability?.status ?? 'offline';
    if (workerStatus !== 'online') {
      // Return empty array — not an error, just no jobs when offline
      return createResponse({ requests: [], worker_status: workerStatus });
    }

    // Fetch `booking_request` notifications sent to this worker in the last 20 minutes
    const since = new Date(Date.now() - 20 * 60 * 1000).toISOString();
    const { data: notifications, error: notifError } = await admin
      .from('notifications')
      .select('id, metadata, created_at')
      .eq('user_id', userId)
      .eq('type', 'booking_request')
      .gte('created_at', since)
      .order('created_at', { ascending: false });

    if (notifError) throw notifError;
    if (!notifications || notifications.length === 0) {
      return createResponse({ requests: [], worker_status: workerStatus });
    }

    // Extract booking IDs from notification metadata
    const bookingIds: string[] = notifications
      .map((n: any) => n.metadata?.booking_id)
      .filter(Boolean);

    if (bookingIds.length === 0) {
      return createResponse({ requests: [], worker_status: workerStatus });
    }

    // Fetch full booking details — ONLY those still broadcasting
    const { data: bookings, error: bookingsError } = await admin
      .from('bookings')
      .select(`
        id,
        category,
        description,
        location_address,
        latitude,
        longitude,
        city_id,
        payment_method,
        service_charge,
        total_price,
        status,
        booking_type,
        scheduled_for,
        scheduled_date,
        scheduled_time_slot,
        image_urls,
        created_at,
        client:clients(
          id,
          profile:profiles(full_name, phone)
        )
      `)
      .in('id', bookingIds)
      .eq('status', 'broadcasting')
      .order('created_at', { ascending: false });

    if (bookingsError) throw bookingsError;

    // Map notification metadata onto bookings
    const requestMap = new Map((notifications ?? []).map(n => [n.metadata?.booking_id, n]));
    const mappedRequests = (bookings ?? []).map((b: any) => {
      const notif = requestMap.get(b.id) as any;
      return {
        ...b,
        response_window_seconds: notif?.metadata?.response_window_seconds ?? 45,
        sent_at: notif?.created_at ?? notif?.metadata?.sent_at ?? b.created_at,
      };
    });

    return createResponse({
      requests: mappedRequests,
      worker_status: workerStatus,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
