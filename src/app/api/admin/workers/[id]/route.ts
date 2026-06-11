import { createClient } from '@/lib/supabase/supabase-server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireAdmin } from '@/lib/auth/admin';
import { createResponse, createErrorResponse, handleApiError } from '@/lib/api-utils';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const gate = await requireAdmin(supabase);
    if (!gate.ok) return createErrorResponse(gate.message, gate.status);

    const { id } = await params;
    const admin = createAdminClient();

    const [workerRes, walletRes, bookingsRes, disputesRes, fraudRes, transactionsRes] =
      await Promise.all([
        admin
          .from('workers')
          .select(`
            *,
            profile:profiles(full_name, email, phone, role, created_at, admin_role),
            documents:worker_documents(*)
          `)
          .eq('id', id)
          .maybeSingle(),
        admin
          .from('worker_wallets')
          .select('balance, currency, updated_at')
          .eq('worker_id', id)
          .maybeSingle(),
        admin
          .from('bookings')
          .select(`
            id, status, category, total_price, payment_method, payment_status,
            commission_amount, created_at, updated_at,
            client:clients(profile:profiles(full_name, phone))
          `)
          .eq('worker_id', id)
          .order('created_at', { ascending: false })
          .limit(30),
        admin
          .from('disputes')
          .select('id, dispute_type, status, priority, title, created_at')
          .or(`raised_by.eq.${id},raised_against.eq.${id}`)
          .order('created_at', { ascending: false })
          .limit(20),
        admin
          .from('fraud_flags')
          .select('id, flag_type, severity, status, description, created_at')
          .eq('user_id', id)
          .order('created_at', { ascending: false })
          .limit(10),
        admin
          .from('wallet_transactions')
          .select('id, type, amount, balance_after, description, booking_id, created_at')
          .eq('worker_id', id)
          .order('created_at', { ascending: false })
          .limit(50),
      ]);

    if (workerRes.error) throw workerRes.error;
    if (!workerRes.data) return createErrorResponse('Worker not found', 404);

    // Compute performance metrics
    const bookings = bookingsRes.data || [];
    const completedCount = bookings.filter((b) =>
      b.status === 'completed'
    ).length;
    const cancelledCount = bookings.filter((b) => b.status === 'cancelled').length;
    const disputedCount = bookings.filter((b) => b.status === 'disputed').length;
    const totalEarned = bookings
      .filter((b) => b.status === 'completed')
      .reduce((sum, b) => sum + Number(b.total_price || 0), 0);
    const totalCommission = bookings.reduce(
      (sum, b) => sum + Number(b.commission_amount || 0),
      0
    );
    const completionRate =
      bookings.length > 0 ? Math.round((completedCount / bookings.length) * 100) : 0;

    return createResponse({
      worker: workerRes.data,
      wallet: walletRes.data || { balance: 0, currency: 'INR' },
      bookings: bookings,
      disputes: disputesRes.data || [],
      fraud_flags: fraudRes.data || [],
      transactions: transactionsRes.data || [],
      stats: {
        total_bookings: bookings.length,
        completed: completedCount,
        cancelled: cancelledCount,
        disputed: disputedCount,
        total_earned: totalEarned,
        total_commission: totalCommission,
        completion_rate: completionRate,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
