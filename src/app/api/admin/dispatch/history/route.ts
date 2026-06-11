import { createClient } from '@/lib/supabase/supabase-server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireAdmin } from '@/lib/auth/admin';
import { createResponse, createErrorResponse, handleApiError } from '@/lib/api-utils';

export async function GET() {
  try {
    const supabase = await createClient();
    const gate = await requireAdmin(supabase);
    if (!gate.ok) return createErrorResponse(gate.message, gate.status);

    const admin = createAdminClient();

    try {
      // 1. Attempt to select from view
      const { data, error } = await admin
        .from('dispatch_history_view')
        .select('*')
        .order('dispatched_at', { ascending: false })
        .limit(50);

      if (error) throw error;

      return createResponse(data);
    } catch (e) {
      console.warn('dispatch_history_view query failed, using manual database fallback.', e);

      // 2. Fallback: Query dispatch_requests table directly
      const { data: requests, error: reqErr } = await admin
        .from('dispatch_requests')
        .select(`
          id,
          booking_id,
          status,
          attempt_count,
          max_attempts,
          current_radius_km,
          created_at,
          updated_at,
          booking:bookings(category, status, client_id, client:clients(profile:profiles(full_name)))
        `)
        .order('created_at', { ascending: false })
        .limit(50);

      if (reqErr) {
        return createErrorResponse(reqErr.message, 500);
      }

      if (!requests || requests.length === 0) {
        return createResponse([]);
      }

      // Fetch attempts for all returned requests
      const requestIds = requests.map(r => r.id);
      const { data: attempts, error: attErr } = await admin
        .from('dispatch_attempts')
        .select(`
          id,
          dispatch_request_id,
          worker_id,
          status,
          sent_at,
          responded_at,
          rejection_reason,
          worker:workers(profile:profiles(full_name), category)
        `)
        .in('dispatch_request_id', requestIds);

      if (attErr) {
        console.error('Error fetching attempts fallback:', attErr.message);
      }

      // Map back to the expected view format
      const formatted = requests.map(r => {
        const matchingAttempts = (attempts || [])
          .filter(a => a.dispatch_request_id === r.id)
          .map(a => ({
            attempt_id: a.id,
            worker_id: a.worker_id,
            worker_name: (a.worker as any)?.profile?.full_name || 'Worker',
            worker_category: (a.worker as any)?.category || '',
            status: a.status,
            sent_at: a.sent_at,
            responded_at: a.responded_at,
            rejection_reason: a.rejection_reason,
          }));

        const bookingObj = r.booking as any;

        return {
          dispatch_id: r.id,
          booking_id: r.booking_id,
          category: bookingObj?.category || '',
          booking_status: bookingObj?.status || '',
          client_id: bookingObj?.client_id || '',
          client_name: bookingObj?.client?.profile?.full_name || 'Client',
          dispatch_status: r.status,
          attempt_count: r.attempt_count,
          max_attempts: r.max_attempts,
          current_radius_km: r.current_radius_km,
          dispatched_at: r.created_at,
          last_updated_at: r.updated_at,
          attempts: matchingAttempts,
        };
      });

      return createResponse(formatted);
    }
  } catch (error) {
    return handleApiError(error);
  }
}
