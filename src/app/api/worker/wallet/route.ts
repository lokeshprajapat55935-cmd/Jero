import { createResponse } from '@/lib/api-utils';
import { withApiErrorHandler, ApiError } from '@/lib/api-error';
import { requireWorker } from '@/lib/auth/server-guard';
import { z } from 'zod';

const topUpSchema = z.object({
  amount: z.number().min(10).max(50000),
});

export const GET = withApiErrorHandler(async (request: Request) => {
  const { user, supabase } = await requireWorker();

  const { searchParams } = new URL(request.url);
  let limit = parseInt(searchParams.get('limit') || '20');
  if (isNaN(limit)) limit = 20;

  // Fetch wallet balance
  const { data: wallet, error: walletError } = await supabase
    .from('worker_wallets')
    .select('*')
    .eq('worker_id', user.id)
    .maybeSingle();

  if (walletError) throw walletError;

  // Fetch transaction ledger
  const { data: transactions, error: txError } = await supabase
    .from('wallet_transactions')
    .select('*')
    .eq('worker_id', user.id)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (txError) throw txError;

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  // Calculate summary stats
  const totalEarned = (transactions || [])
    .filter(t => t.type === 'credit' || t.type === 'online_credit' || t.type === 'recharge')
    .reduce((sum: number, t: any) => sum + Number(t.amount), 0);

  const totalCommission = (transactions || [])
    .filter(t => t.type === 'commission')
    .reduce((sum: number, t: any) => sum + Number(t.amount), 0);
    
  const commissionsThisMonth = (transactions || [])
    .filter(t => t.type === 'commission' && t.created_at >= startOfMonth)
    .reduce((sum: number, t: any) => sum + Number(t.amount), 0);
    
  const earningsThisMonth = (transactions || [])
    .filter(t => (t.type === 'credit' || t.type === 'online_credit') && t.created_at >= startOfMonth)
    .reduce((sum: number, t: any) => sum + Number(t.amount), 0);
    
  const rechargeTotal = (transactions || [])
    .filter(t => t.type === 'recharge')
    .reduce((sum: number, t: any) => sum + Number(t.amount), 0);

  return createResponse({
    wallet: wallet ?? { worker_id: user.id, balance: 0.00, currency: 'INR' },
    transactions: transactions ?? [],
    stats: {
      total_earned: totalEarned,
      total_commission_paid: totalCommission,
      net_earnings: totalEarned - totalCommission,
      commissions_this_month: commissionsThisMonth,
      earnings_this_month: earningsThisMonth,
      recharge_total: rechargeTotal
    },
  });
});

export const POST = withApiErrorHandler(async (request: Request) => {
  // SECURED: Removed the unverified dev fallback.
  // Real wallet top-ups must be handled via secure webhooks from Razorpay/PhonePe.
  throw new ApiError(503, 'Online wallet recharge is coming soon.');
});
