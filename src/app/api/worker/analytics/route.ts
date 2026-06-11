import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/supabase-server';

/**
 * GET /api/worker/analytics?period=today|week|month
 * Returns earnings, job counts, and rating summary for the authenticated worker.
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { getAuthUserId } = await import('@/lib/api-utils');
    const userId = await getAuthUserId(req, supabase);

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { createAdminClient } = await import('@/lib/supabase/admin');
    const admin = createAdminClient();

    // Verify worker role
    const { data: profile } = await admin
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .maybeSingle();

    if (!profile || profile.role !== 'worker') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const period = req.nextUrl.searchParams.get('period') ?? 'today';

    // Compute date range
    const now = new Date();
    let since: Date;
    if (period === 'week') {
      since = new Date(now);
      since.setDate(now.getDate() - 7);
    } else if (period === 'month') {
      since = new Date(now);
      since.setMonth(now.getMonth() - 1);
    } else {
      // today
      since = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    }

    // Fetch completed bookings in period
    const { data: bookings, error: bErr } = await admin
      .from('bookings')
      .select('id, total_price, service_charge, material_charge, status, scheduled_at, commission_amount')
      .eq('worker_id', userId)
      .gte('updated_at', since.toISOString())
      .in('status', ['completed', 'paid_completed']);

    if (bErr) throw bErr;

    // Fetch wallet transactions in period
    const { data: transactions, error: tErr } = await admin
      .from('wallet_transactions')
      .select('type, amount, created_at')
      .eq('worker_id', userId)
      .gte('created_at', since.toISOString())
      .order('created_at', { ascending: false });

    if (tErr) throw tErr;

    // Aggregate earnings
    const totalEarnings = (bookings ?? []).reduce((sum, b) => sum + Number(b.total_price), 0);
    const totalJobs = (bookings ?? []).length;
    const totalCommission = (bookings ?? []).reduce((sum, b) => sum + Number(b.commission_amount || 0), 0);

    // Fetch total dispatched vs accepted for acceptance rate
    const { count: totalDispatched } = await admin
      .from('dispatch_attempts')
      .select('id', { count: 'exact', head: true })
      .eq('worker_id', userId);

    const { count: totalAccepted } = await admin
      .from('dispatch_attempts')
      .select('id', { count: 'exact', head: true })
      .eq('worker_id', userId)
      .eq('status', 'accepted');

    // Fetch worker rating
    const { data: worker } = await admin
      .from('workers')
      .select('rating_avg, review_count')
      .eq('id', userId)
      .maybeSingle();

    // Build daily earnings breakdown for sparkline (last 7 days regardless of period)
    const sevenDaysAgo = new Date(now);
    sevenDaysAgo.setDate(now.getDate() - 6);
    const { data: weeklyBookings } = await admin
      .from('bookings')
      .select('total_price, updated_at')
      .eq('worker_id', userId)
      .gte('updated_at', sevenDaysAgo.toISOString())
      .in('status', ['completed', 'paid_completed']);

    // Group by day
    const dailyMap: Record<string, number> = {};
    for (let i = 0; i < 7; i++) {
      const d = new Date(sevenDaysAgo);
      d.setDate(sevenDaysAgo.getDate() + i);
      dailyMap[d.toISOString().split('T')[0]] = 0;
    }
    (weeklyBookings ?? []).forEach((b) => {
      const day = b.updated_at.split('T')[0];
      if (dailyMap[day] !== undefined) {
        dailyMap[day] += Number(b.total_price);
      }
    });
    const sparklineData = Object.entries(dailyMap).map(([date, amount]) => ({ date, amount }));

    const acceptanceRate =
      totalDispatched && totalDispatched > 0
        ? Math.round(((totalAccepted ?? 0) / totalDispatched) * 100)
        : 100;

    return NextResponse.json({
      success: true,
      data: {
        period,
        totalEarnings: Math.round(totalEarnings),
        totalJobs,
        totalCommission: Math.round(totalCommission),
        netEarnings: Math.round(totalEarnings - totalCommission),
        ratingAvg: worker?.rating_avg ?? 0,
        reviewCount: worker?.review_count ?? 0,
        acceptanceRate,
        totalDispatched: totalDispatched ?? 0,
        totalAccepted: totalAccepted ?? 0,
        sparklineData,
        recentTransactions: (transactions ?? []).slice(0, 10),
      },
    });
  } catch (err: any) {
    console.error('[/api/worker/analytics]', err);
    return NextResponse.json({ error: err.message ?? 'Internal error' }, { status: 500 });
  }
}
