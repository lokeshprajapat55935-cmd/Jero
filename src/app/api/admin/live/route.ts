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
    const todayStart = new Date(new Date().setHours(0, 0, 0, 0)).toISOString();

    // Run all snapshot queries in parallel for speed
    const [
      activeBookingsRes,
      onlineWorkersRes,
      openDisputesRes,
      failedPaymentsRes,
      todayRevenueRes,
      recentActivityRes,
      broadcastingRes,
      activeDispatchesRes,
      failedDispatchesRes,
      totalCustomersRes,
      totalWorkersRes,
      pendingApprovalsRes,
      pendingWithdrawalsRes,
      monthRevenueRes,
      cancelledTodayRes,
    ] = await Promise.all([
      admin
        .from('bookings')
        .select(`
          id, status, category, total_price, payment_method, created_at, latitude, longitude,
          client:clients(profile:profiles(full_name)),
          worker:workers(profile:profiles(full_name), category)
        `)
        .not('status', 'in', '(completed,cancelled,disputed)')
        .order('created_at', { ascending: false }),
      admin
        .from('workers')
        .select(`
          id, category, area_id, rating_avg, status, city_id,
          availability:worker_availability(status, last_active_at),
          location:worker_locations(latitude, longitude),
          profile:profiles(full_name)
        `),
      admin
        .from('disputes')
        .select('id', { count: 'exact' })
        .in('status', ['open', 'under_review']),
      admin
        .from('payment_transactions')
        .select('id', { count: 'exact' })
        .eq('payment_status', 'failed')
        .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()),
      admin
        .from('bookings')
        .select('total_price, status')
        .in('status', ['completed', 'paid_completed'])
        .gte('created_at', todayStart),
      admin
        .from('bookings')
        .select(`
          id, status, category, total_price, payment_method, created_at,
          client:clients(profile:profiles(full_name)),
          worker:workers(profile:profiles(full_name), category)
        `)
        .order('updated_at', { ascending: false })
        .limit(8),
      admin
        .from('bookings')
        .select('id', { count: 'exact' })
        .eq('status', 'broadcasting'),
      admin
        .from('dispatch_requests')
        .select(`
          id,
          booking_id,
          status,
          current_radius_km,
          max_radius_km,
          created_at,
          booking:bookings(category, total_price, latitude, longitude, location_address)
        `)
        .eq('status', 'searching'),
      admin
        .from('dispatch_requests')
        .select('id', { count: 'exact' })
        .eq('status', 'expired'),
      admin.from('profiles').select('id', { count: 'exact' }).eq('role', 'client'),
      admin.from('profiles').select('id', { count: 'exact' }).eq('role', 'worker'),
      admin.from('workers').select('id', { count: 'exact' }).eq('verification_status', 'pending'),
      admin.from('payout_logs').select('id', { count: 'exact' }).eq('status', 'pending'),
      admin.from('bookings').select('total_price, platform_fee').in('status', ['completed', 'paid_completed']).gte('created_at', new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()),
      admin.from('bookings').select('id', { count: 'exact' }).eq('status', 'cancelled').gte('updated_at', todayStart),
    ]);

    const todayRevenue = (todayRevenueRes.data || []).reduce(
      (sum, b) => sum + Number(b.total_price || 0),
      0
    );

    const monthRevenue = (monthRevenueRes.data || []).reduce(
      (sum, b) => sum + Number(b.total_price || 0),
      0
    );

    const platformCommission = (monthRevenueRes.data || []).reduce(
      (sum, b) => sum + Number(b.platform_fee || 0),
      0
    );

    const onlineWorkersList = onlineWorkersRes.data || [];
    const idleOnlineCount = onlineWorkersList.filter((w: any) => {
      const avail = Array.isArray(w.availability) ? w.availability[0] : w.availability;
      return avail?.status === 'online';
    }).length;

    return createResponse({
      snapshot: {
        active_bookings: (activeBookingsRes.data || []).length,
        online_workers: idleOnlineCount,
        open_disputes: openDisputesRes.count ?? 0,
        failed_payments_24h: failedPaymentsRes.count ?? 0,
        today_revenue: todayRevenue,
        today_bookings: (todayRevenueRes.data || []).length,
        cancelled_today: cancelledTodayRes.count ?? 0,
        broadcasting_bookings: broadcastingRes.count ?? 0,
        failed_dispatches: failedDispatchesRes.count ?? 0,
        active_dispatches: (activeDispatchesRes.data || []).length,
        total_customers: totalCustomersRes.count ?? 0,
        total_workers: totalWorkersRes.count ?? 0,
        pending_approvals: pendingApprovalsRes.count ?? 0,
        pending_withdrawals: pendingWithdrawalsRes.count ?? 0,
        month_revenue: monthRevenue,
        platform_commission: platformCommission,
      },
      active_bookings: activeBookingsRes.data || [],
      online_workers: onlineWorkersList,
      recent_activity: recentActivityRes.data || [],
      active_dispatches: activeDispatchesRes.data || [],
    });
  } catch (error) {
    return handleApiError(error);
  }
}
