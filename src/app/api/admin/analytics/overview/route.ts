import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/supabase-server';
import { requireAdmin } from '@/lib/auth/admin';
import { createResponse, createErrorResponse, handleApiError } from '@/lib/api-utils';

export async function GET(request: Request) {
  try {
    const userSupabase = await createClient();
    const gate = await requireAdmin(userSupabase);
    if (!gate.ok) return createErrorResponse(gate.message, gate.status);

    const admin = createAdminClient();

    // Query statistics
    const [
      profilesRes,
      bookingsRes,
      eventsRes
    ] = await Promise.all([
      admin.from('profiles').select('role'),
      admin.from('bookings').select('status, total_price'),
      admin.from('analytics_events').select(`
        *,
        profile:profiles(full_name, email)
      `).order('created_at', { ascending: false }).limit(20)
    ]);

    if (profilesRes.error) throw profilesRes.error;
    if (bookingsRes.error) throw bookingsRes.error;
    if (eventsRes.error) throw eventsRes.error;

    // Calculate profiles aggregates
    const profileCounts: Record<string, number> = { client: 0, worker: 0, admin: 0 };
    (profilesRes.data || []).forEach((p: any) => {
      profileCounts[p.role] = (profileCounts[p.role] || 0) + 1;
    });

    // Calculate bookings aggregates
    const bookingCounts: Record<string, number> = {};
    let totalCashValue = 0;
    (bookingsRes.data || []).forEach((b: any) => {
      bookingCounts[b.status] = (bookingCounts[b.status] || 0) + 1;
      if (b.status === 'completed') {
        totalCashValue += Number(b.total_price) || 0;
      }
    });

    return createResponse({
      stats: {
        users: {
          total: profilesRes.data.length,
          clients: profileCounts.client,
          workers: profileCounts.worker,
          admins: profileCounts.admin,
        },
        bookings: {
          total: bookingsRes.data.length,
          completed: bookingCounts.completed || 0,
          pending: (bookingCounts.pending || 0) + (bookingCounts.broadcasting || 0),
          confirmed: (bookingCounts.accepted || 0) + 
                     (bookingCounts.worker_arriving || 0) + 
                     (bookingCounts.work_started || 0) + 
                     (bookingCounts.work_completed || 0) + 
                     (bookingCounts.awaiting_item_approval || 0) + 
                     (bookingCounts.item_approved || 0) + 
                     (bookingCounts.otp_generated || 0) + 
                     (bookingCounts.otp_verified || 0) + 
                     (bookingCounts.awaiting_payment || 0) +
                     (bookingCounts.payment_processing || 0) +
                     (bookingCounts.payment_verified || 0),
          cancelled: bookingCounts.cancelled || 0,
          disputed: bookingCounts.disputed || 0,
          cashCollected: totalCashValue,
        }
      },
      recentEvents: eventsRes.data || []
    });
  } catch (error) {
    return handleApiError(error);
  }
}
