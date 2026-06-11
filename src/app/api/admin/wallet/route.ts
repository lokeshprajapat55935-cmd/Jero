import { createClient } from '@/lib/supabase/supabase-server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createResponse, createErrorResponse, handleApiError, getAuthUserId } from '@/lib/api-utils';
import { z } from 'zod';
import { verifyAdminRole } from '@/lib/auth/admin-auth';

const adjustmentSchema = z.object({
  worker_id: z.string().uuid(),
  amount: z.number().min(1).max(100000),
  type: z.enum(['credit', 'debit', 'adjustment']),
  description: z.string().min(5).max(300),
});

export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const userId = await getAuthUserId(request as any, supabase);
    if (!userId) return createErrorResponse('Not authenticated', 401);

    // Enforce role-based admin permission check (super_admin or finance_admin)
    const authCheck = await verifyAdminRole(userId, ['super_admin', 'finance_admin']);
    if (!authCheck.authorized) {
      return createErrorResponse('Forbidden: Wallet operations require Super Admin or Finance Admin privileges', 403);
    }

    const admin = createAdminClient();
    const { searchParams } = new URL(request.url);
    const workerId = searchParams.get('worker_id');

    if (workerId) {
      // Get a specific worker's wallet + full transaction history
      const [walletRes, txRes, profileRes] = await Promise.all([
        admin.from('worker_wallets').select('*').eq('worker_id', workerId).maybeSingle(),
        admin.from('wallet_transactions').select('*').eq('worker_id', workerId).order('created_at', { ascending: false }).limit(50),
        admin.from('profiles').select('id, full_name, avatar_url, phone').eq('id', workerId).maybeSingle(),
      ]);

      return createResponse({
        worker: profileRes.data,
        wallet: walletRes.data ?? { worker_id: workerId, balance: 0, currency: 'INR' },
        transactions: txRes.data ?? [],
      });
    }

    // Get all worker wallets with profile info
    const { data: wallets, error } = await admin
      .from('worker_wallets')
      .select(`
        *,
        profile:profiles(id, full_name, avatar_url, phone)
      `)
      .order('balance', { ascending: true }); // lowest balance first (at-risk workers)

    if (error) throw error;

    return createResponse({ wallets: wallets ?? [] });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const supabase = await createClient();
    const userId = await getAuthUserId(request as any, supabase);
    if (!userId) return createErrorResponse('Not authenticated', 401);

    // Enforce role-based admin permission check (super_admin or finance_admin)
    const authCheck = await verifyAdminRole(userId, ['super_admin', 'finance_admin']);
    if (!authCheck.authorized) {
      return createErrorResponse('Forbidden: Wallet adjustments require Super Admin or Finance Admin privileges', 403);
    }

    const body = adjustmentSchema.parse(await request.json());
    const admin = createAdminClient();

    // Use the atomic DB function for safe adjustment
    const { data: result, error } = await admin.rpc('admin_wallet_adjustment', {
      p_worker_id: body.worker_id,
      p_amount: body.amount,
      p_type: body.type,
      p_description: body.description,
      p_admin_id: userId,
    });

    if (error) throw error;

    const adjustResult = result as { success: boolean; type: string; amount: number; new_balance: number };
    return createResponse({
      success: true,
      type: adjustResult.type,
      amount: adjustResult.amount,
      new_balance: adjustResult.new_balance,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return createErrorResponse('Validation error', 400, error.flatten().fieldErrors);
    }
    return handleApiError(error);
  }
}
