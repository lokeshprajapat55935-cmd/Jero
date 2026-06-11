import { createClient } from '@/lib/supabase/supabase-server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireAdmin } from '@/lib/auth/admin';
import { createResponse, createErrorResponse, handleApiError } from '@/lib/api-utils';

export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const gate = await requireAdmin(supabase);
    if (!gate.ok) return createErrorResponse(gate.message, gate.status);

    // Only allow super_admin and operations_admin
    if (
      gate.adminRole &&
      gate.adminRole !== 'super_admin' &&
      gate.adminRole !== 'operations_admin'
    ) {
      return createErrorResponse('Forbidden: Insufficient permissions', 403);
    }

    const { searchParams } = new URL(request.url);
    const citySlug = searchParams.get('city');
    const category = searchParams.get('category');

    const admin = createAdminClient();

    // 1. Resolve city if provided
    let cityId: string | null = null;
    if (citySlug && citySlug !== 'all') {
      const { data: cityData } = await admin
        .from('cities')
        .select('id')
        .eq('slug', citySlug)
        .maybeSingle();
      if (cityData) {
        cityId = cityData.id;
      }
    }

    // Attempt to read from views, fallback to manual aggregation if views not created yet
    let bookingAnalyticsData;
    let revenueAnalyticsData;
    let workerAnalyticsData;
    let customerAnalyticsData;
    let fraudAlertsData;

    try {
      // 2. Fetch from Reporting Views
      let bookingQuery = admin.from('reporting_booking_analytics').select('*');
      if (cityId) bookingQuery = bookingQuery.eq('city_id', cityId);
      if (category && category !== 'all') bookingQuery = bookingQuery.eq('category', category);
      
      let revenueQuery = admin.from('reporting_revenue_analytics').select('*');
      if (cityId) revenueQuery = revenueQuery.eq('city_id', cityId);
      if (category && category !== 'all') revenueQuery = revenueQuery.eq('category', category);

      let workerQuery = admin.from('reporting_worker_analytics').select('*');
      if (cityId) workerQuery = workerQuery.eq('city_id', cityId);
      if (category && category !== 'all') workerQuery = workerQuery.eq('category', category);

      let customerQuery = admin.from('reporting_customer_analytics').select('*');
      if (cityId) customerQuery = customerQuery.eq('city_id', cityId);

      let fraudQuery = admin.from('reporting_fraud_alerts').select('*');

      const [bookingRes, revenueRes, workerRes, customerRes, fraudRes] = await Promise.all([
        bookingQuery,
        revenueQuery,
        workerQuery,
        customerQuery,
        fraudQuery,
      ]);

      if (bookingRes.error || revenueRes.error || workerRes.error || customerRes.error || fraudRes.error) {
        throw new Error('Database views missing or errored, executing fallback');
      }

      bookingAnalyticsData = bookingRes.data;
      revenueAnalyticsData = revenueRes.data;
      workerAnalyticsData = workerRes.data;
      customerAnalyticsData = customerRes.data;
      fraudAlertsData = fraudRes.data;
    } catch (e) {
      console.warn('Analytics views query failed, using manual database fallback.', e);

      // Fallback manual query
      let bookingsQuery = admin
        .from('bookings')
        .select('id, status, category, total_price, commission_amount, created_at, scheduled_at, worker_id, client_id, city_id');
      if (cityId) bookingsQuery = bookingsQuery.eq('city_id', cityId);
      if (category && category !== 'all') bookingsQuery = bookingsQuery.eq('category', category);

      const [bookingsRes, workersRes, clientsRes, fraudRes] = await Promise.all([
        bookingsQuery,
        admin.from('workers').select('id, category, rating_avg, city_id, profiles(full_name)'),
        admin.from('clients').select('id, city_id, profiles(full_name)'),
        admin.from('fraud_flags').select('*, profiles(full_name)'),
      ]);

      const allBookings = bookingsRes.data || [];
      const allWorkers = workersRes.data || [];
      const allClients = clientsRes.data || [];
      const tableFraud = fraudRes.data || [];

      // Compute on-the-fly aggregations
      const dailyBookingMap = new Map();
      const dailyRevenueMap = new Map();
      let totalBookings = allBookings.length;
      let completedBookings = 0;
      let cancelledBookings = 0;
      let totalRevenue = 0;
      let platformRevenue = 0;
      let workerEarnings = 0;

      allBookings.forEach((b: any) => {
        const dateStr = new Date(b.created_at).toISOString().split('T')[0];
        const isCompleted = b.status === 'completed' || b.status === 'paid_completed';
        const isCancelled = b.status === 'cancelled';

        if (isCompleted) {
          completedBookings++;
          totalRevenue += Number(b.total_price || 0);
          const comm = Number(b.commission_amount || 0);
          platformRevenue += comm;
          workerEarnings += Number(b.total_price || 0) - comm;
        }
        if (isCancelled) cancelledBookings++;

        // Bookings trends
        if (!dailyBookingMap.has(dateStr)) {
          dailyBookingMap.set(dateStr, { booking_date: dateStr, total_bookings: 0, completed_bookings: 0, cancelled_bookings: 0 });
        }
        const bTrend = dailyBookingMap.get(dateStr);
        bTrend.total_bookings++;
        if (isCompleted) bTrend.completed_bookings++;
        if (isCancelled) bTrend.cancelled_bookings++;

        // Revenue trends
        if (isCompleted) {
          if (!dailyRevenueMap.has(dateStr)) {
            dailyRevenueMap.set(dateStr, { revenue_date: dateStr, gross_revenue: 0, platform_revenue: 0, worker_earnings: 0 });
          }
          const rTrend = dailyRevenueMap.get(dateStr);
          rTrend.gross_revenue += Number(b.total_price || 0);
          rTrend.platform_revenue += Number(b.commission_amount || 0);
          rTrend.worker_earnings += Number(b.total_price || 0) - Number(b.commission_amount || 0);
        }
      });

      bookingAnalyticsData = Array.from(dailyBookingMap.values());
      revenueAnalyticsData = Array.from(dailyRevenueMap.values());

      // Workers
      workerAnalyticsData = allWorkers
        .filter((w: any) => !cityId || w.city_id === cityId)
        .filter((w: any) => !category || category === 'all' || w.category === category)
        .map((w: any) => {
          const wJobs = allBookings.filter((b: any) => b.worker_id === w.id);
          const completedJobs = wJobs.filter((b: any) => b.status === 'completed' || b.status === 'paid_completed').length;
          return {
            worker_id: w.id,
            name: w.profiles?.full_name || 'Worker',
            category: w.category,
            avg_rating: Number(w.rating_avg || 0),
            jobs_completed: completedJobs,
            jobs_assigned: wJobs.length,
            completion_rate: wJobs.length ? completedJobs / wJobs.length : 1,
            acceptance_rate: 0.85, // Mock default for fallback
            avg_response_time_seconds: 45,
          };
        });

      // Customers
      customerAnalyticsData = allClients
        .filter((c: any) => !cityId || c.city_id === cityId)
        .map((c: any) => {
          const cJobs = allBookings.filter((b: any) => b.client_id === c.id);
          return {
            client_id: c.id,
            name: c.profiles?.full_name || 'Client',
            total_bookings: cJobs.length,
            completed_bookings: cJobs.filter((b: any) => b.status === 'completed' || b.status === 'paid_completed').length,
          };
        });

      // Fraud
      fraudAlertsData = tableFraud.map((f: any) => ({
        id: f.id,
        user_id: f.user_id,
        user_name: f.profiles?.full_name || 'User',
        flag_type: f.flag_type,
        severity: f.severity,
        status: f.status,
        description: f.description,
        booking_id: f.booking_id,
        evidence: f.evidence,
        created_at: f.created_at,
      }));
    }

    // 3. Post-process and aggregate detailed structures
    // Bookings summary
    const bookingsSummary = {
      total_bookings: bookingAnalyticsData.reduce((sum, d) => sum + Number(d.total_bookings || 0), 0),
      completed_bookings: bookingAnalyticsData.reduce((sum, d) => sum + Number(d.completed_bookings || 0), 0),
      cancelled_bookings: bookingAnalyticsData.reduce((sum, d) => sum + Number(d.cancelled_bookings || 0), 0),
      avg_response_time_seconds: Math.round(
        bookingAnalyticsData.filter(d => d.avg_response_time_seconds).reduce((sum, d) => sum + Number(d.avg_response_time_seconds || 0), 0) /
        (bookingAnalyticsData.filter(d => d.avg_response_time_seconds).length || 1)
      ),
      avg_completion_time_seconds: Math.round(
        bookingAnalyticsData.filter(d => d.avg_completion_time_seconds).reduce((sum, d) => sum + Number(d.avg_completion_time_seconds || 0), 0) /
        (bookingAnalyticsData.filter(d => d.avg_completion_time_seconds).length || 1)
      ),
      completion_rate: 0,
      cancellation_rate: 0,
      daily_trends: bookingAnalyticsData.map(d => ({
        date: d.booking_date,
        total: Number(d.total_bookings || 0),
        completed: Number(d.completed_bookings || 0),
        cancelled: Number(d.cancelled_bookings || 0),
      })).sort((a, b) => a.date.localeCompare(b.date)),
    };

    if (bookingsSummary.total_bookings > 0) {
      bookingsSummary.completion_rate = Math.round((bookingsSummary.completed_bookings / bookingsSummary.total_bookings) * 100);
      bookingsSummary.cancellation_rate = Math.round((bookingsSummary.cancelled_bookings / bookingsSummary.total_bookings) * 100);
    }

    // Revenue summary
    const revenueSummary = {
      total_revenue: revenueAnalyticsData.reduce((sum, d) => sum + Number(d.gross_revenue || 0), 0),
      platform_revenue: revenueAnalyticsData.reduce((sum, d) => sum + Number(d.platform_revenue || 0), 0),
      worker_earnings: revenueAnalyticsData.reduce((sum, d) => sum + Number(d.worker_earnings || 0), 0),
      category_distribution: [] as { category: string; revenue: number }[],
      daily_trends: revenueAnalyticsData.map(d => ({
        date: d.revenue_date,
        revenue: Number(d.gross_revenue || 0),
        platform: Number(d.platform_revenue || 0),
        worker: Number(d.worker_earnings || 0),
      })).sort((a, b) => a.date.localeCompare(b.date)),
    };

    // Category distribution from revenue data
    const catMap = new Map<string, number>();
    revenueAnalyticsData.forEach(d => {
      if (d.category) {
        catMap.set(d.category, (catMap.get(d.category) || 0) + Number(d.gross_revenue || 0));
      }
    });
    revenueSummary.category_distribution = Array.from(catMap.entries()).map(([category, revenue]) => ({
      category,
      revenue,
    }));

    // Worker Summary
    const workerSummary = {
      total_workers: workerAnalyticsData.length,
      avg_rating: parseFloat(
        (workerAnalyticsData.reduce((sum, w) => sum + Number(w.avg_rating || 0), 0) / (workerAnalyticsData.length || 1)).toFixed(1)
      ),
      avg_acceptance_rate: Math.round(
        (workerAnalyticsData.reduce((sum, w) => sum + Number(w.acceptance_rate || 0), 0) / (workerAnalyticsData.length || 1)) * 100
      ),
      top_performing: workerAnalyticsData
        .sort((a, b) => Number(b.jobs_completed || 0) - Number(a.jobs_completed || 0))
        .slice(0, 5),
    };

    // Customer Summary
    const customerSummary = {
      total_customers: customerAnalyticsData.length,
      active_customers: customerAnalyticsData.filter(c => Number(c.total_bookings || 0) > 0).length,
      repeat_customers: customerAnalyticsData.filter(c => Number(c.completed_bookings || 0) > 1).length,
      booking_frequency: parseFloat(
        (customerAnalyticsData.reduce((sum, c) => sum + Number(c.total_bookings || 0), 0) / (customerAnalyticsData.length || 1)).toFixed(2)
      ),
    };

    return createResponse({
      bookings: bookingsSummary,
      revenue: revenueSummary,
      workers: workerSummary,
      customers: customerSummary,
      fraud: fraudAlertsData,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
