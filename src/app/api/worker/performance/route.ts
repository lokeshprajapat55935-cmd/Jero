import { getAuthUserId } from '@/lib/api-utils';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/supabase-server';

/**
 * GET /api/worker/performance
 * Returns acceptance rate, cancellation rate, completion rate, avg response time, fraud score.
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const userId = await getAuthUserId(req, supabase);

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .single();

    if (!profile || profile.role !== 'worker') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // All dispatch attempts for this worker
    const { data: attempts } = await supabase
      .from('dispatch_attempts')
      .select('status, created_at')
      .eq('worker_id', userId);

    const totalDispatched = attempts?.length ?? 0;
    const accepted = attempts?.filter((a) => a.status === 'accepted').length ?? 0;
    const rejected = attempts?.filter((a) => a.status === 'rejected').length ?? 0;
    const expired = attempts?.filter((a) => a.status === 'expired').length ?? 0;

    const acceptanceRate = totalDispatched > 0 ? Math.round((accepted / totalDispatched) * 100) : 100;
    const rejectionRate = totalDispatched > 0 ? Math.round((rejected / totalDispatched) * 100) : 0;

    // Bookings for cancellation & completion rates
    const { data: bookings } = await supabase
      .from('bookings')
      .select('status')
      .eq('worker_id', userId);

    const totalBookings = bookings?.length ?? 0;
    const cancelled = bookings?.filter((b) => b.status === 'cancelled').length ?? 0;
    const completed = bookings?.filter((b) => ['completed', 'paid_completed'].includes(b.status)).length ?? 0;
    const started = bookings?.filter((b) => ['work_started', 'work_completed', 'completed', 'paid_completed', 'awaiting_item_approval', 'item_approved', 'otp_generated', 'otp_verified', 'awaiting_payment', 'payment_processing', 'payment_verified'].includes(b.status)).length ?? 0;

    const cancellationRate = totalBookings > 0 ? Math.round((cancelled / totalBookings) * 100) : 0;
    const completionRate = started > 0 ? Math.round((completed / started) * 100) : 100;

    // Worker rating
    const { data: worker } = await supabase
      .from('workers')
      .select('rating_avg, review_count')
      .eq('id', userId)
      .single();

    // Fraud score — composite 0-100 (lower = cleaner)
    // Penalty factors: high cancellation, low acceptance, repeated expired dispatches
    const fraudScore = Math.min(
      100,
      Math.max(
        0,
        (cancellationRate > 20 ? 25 : 0) +
          (acceptanceRate < 50 ? 30 : 0) +
          (rejectionRate > 40 ? 20 : 0) +
          (expired > 10 ? 25 : 0)
      )
    );

    const fraudRisk: 'low' | 'medium' | 'high' =
      fraudScore >= 50 ? 'high' : fraudScore >= 25 ? 'medium' : 'low';

    return NextResponse.json({
      success: true,
      data: {
        totalDispatched,
        accepted,
        rejected,
        expired,
        totalBookings,
        completed,
        cancelled,
        acceptanceRate,
        rejectionRate,
        cancellationRate,
        completionRate,
        ratingAvg: worker?.rating_avg ?? 0,
        reviewCount: worker?.review_count ?? 0,
        fraudScore,
        fraudRisk,
      },
    });
  } catch (err: any) {
    console.error('[/api/worker/performance]', err);
    return NextResponse.json({ error: err.message ?? 'Internal error' }, { status: 500 });
  }
}
