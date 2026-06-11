import { createClient } from '@/lib/supabase/supabase-server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createResponse, createErrorResponse, handleApiError, getAuthUserId } from '@/lib/api-utils';
import { z } from 'zod';

// ── Razorpay Payouts configuration ────────────────────────────────────────────
const RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID || '';
const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || '';
const RAZORPAY_ACCOUNT_NUMBER = process.env.RAZORPAY_PAYOUT_ACCOUNT_NUMBER || '';

const MIN_WITHDRAW = 100;  // ₹100 minimum withdrawal
const MAX_WITHDRAW = 50000; // ₹50,000 maximum withdrawal

// ── Schemas ───────────────────────────────────────────────────────────────────
const withdrawSchema = z.object({
  amount: z.number().min(MIN_WITHDRAW).max(MAX_WITHDRAW),
  method: z.enum(['bank', 'upi']),
  // Bank account details
  account_number: z.string().optional(),
  ifsc_code: z.string().optional(),
  account_name: z.string().optional(),
  // UPI details
  upi_id: z.string().optional(),
}).refine(
  (data) => {
    if (data.method === 'bank') {
      return !!data.account_number && !!data.ifsc_code && !!data.account_name;
    }
    if (data.method === 'upi') {
      return !!data.upi_id;
    }
    return true;
  },
  { message: 'Please provide complete payment details' }
);

// ── POST: Initiate withdrawal via Razorpay Payouts ────────────────────────────
export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const userId = await getAuthUserId(request as any, supabase);
    if (!userId) return createErrorResponse('Not authenticated', 401);

    const body = await request.json();
    const parsed = withdrawSchema.parse(body);

    const admin = createAdminClient();

    // Check wallet balance
    const { data: wallet } = await admin
      .from('worker_wallets')
      .select('balance')
      .eq('worker_id', userId)
      .maybeSingle();

    const currentBalance = Number(wallet?.balance ?? 0);
    if (currentBalance < parsed.amount) {
      return createErrorResponse(
        `Insufficient balance. Available: ₹${currentBalance.toFixed(2)}`,
        400
      );
    }

    // Keep ₹500 minimum in wallet (required to go online)
    if (currentBalance - parsed.amount < 500) {
      return createErrorResponse(
        `You must maintain a minimum balance of ₹500 in your wallet. Max withdrawable: ₹${Math.max(0, currentBalance - 500).toFixed(2)}`,
        400
      );
    }

    const referenceId = `WD_${userId.replace(/-/g, '').slice(0, 12)}_${Date.now()}`;

    // Build Razorpay Payouts payload
    const payoutPayload: Record<string, any> = {
      account_number: RAZORPAY_ACCOUNT_NUMBER,
      amount: Math.round(parsed.amount * 100), // in paise
      currency: 'INR',
      mode: parsed.method === 'upi' ? 'UPI' : 'NEFT',
      purpose: 'payout',
      reference_id: referenceId,
      narration: `Zolvo Partner Withdrawal - ${referenceId}`,
    };

    const { data: profile } = await admin
      .from('profiles')
      .select('full_name')
      .eq('id', userId)
      .maybeSingle();

    if (parsed.method === 'upi') {
      payoutPayload.fund_account = {
        account_type: 'vpa',
        vpa: { address: parsed.upi_id },
        contact: {
          name: profile?.full_name || 'Worker',
          type: 'self',
        },
      };
    } else {
      payoutPayload.fund_account = {
        account_type: 'bank_account',
        bank_account: {
          name: parsed.account_name,
          ifsc: parsed.ifsc_code,
          account_number: parsed.account_number,
        },
        contact: {
          name: parsed.account_name,
          type: 'self',
        },
      };
    }

    // ── Deduct from wallet first (atomic via RPC only) ───────────────────
    const { error: rpcError } = await admin.rpc('debit_worker_wallet', {
      p_worker_id: userId,
      p_amount: parsed.amount,
      p_description: `Withdrawal request ${referenceId}`,
      p_reference_id: referenceId,
    });

    if (rpcError) {
      return createErrorResponse(`Withdrawal failed: ${rpcError.message}`, 400);
    }

    // ── Create payout record ──────────────────────────────────────────────────
    await admin.from('payout_logs').insert({
      worker_id: userId,
      amount: parsed.amount,
      payment_method: parsed.method === 'upi' ? 'upi' : 'bank_transfer',
      status: 'processing',
      reference_id: referenceId,
      notes: JSON.stringify({
        method: parsed.method,
        upi_id: parsed.upi_id,
        account_number: parsed.account_number ? `****${parsed.account_number.slice(-4)}` : null,
        ifsc: parsed.ifsc_code,
      }),
    });

    // ── Call Razorpay Payouts API if credentials configured ──────────────────
    let razorpayResult: any = null;
    if (RAZORPAY_KEY_ID && RAZORPAY_KEY_SECRET && RAZORPAY_ACCOUNT_NUMBER) {
      try {
        const authHeader = `Basic ${Buffer.from(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`).toString('base64')}`;

        // Step 1: Create Fund Account
        const faRes = await fetch('https://api.razorpay.com/v1/fund_accounts', {
          method: 'POST',
          headers: {
            Authorization: authHeader,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payoutPayload.fund_account),
        });
        const faData = await faRes.json();

        if (faData.id) {
          // Step 2: Create Payout
          const payoutRes = await fetch('https://api.razorpay.com/v1/payouts', {
            method: 'POST',
            headers: {
              Authorization: authHeader,
              'Content-Type': 'application/json',
              'X-Payout-Idempotency': referenceId,
            },
            body: JSON.stringify({
              account_number: RAZORPAY_ACCOUNT_NUMBER,
              fund_account_id: faData.id,
              amount: Math.round(parsed.amount * 100),
              currency: 'INR',
              mode: payoutPayload.mode,
              purpose: 'payout',
              reference_id: referenceId,
              narration: payoutPayload.narration,
            }),
          });
          razorpayResult = await payoutRes.json();

          // Update payout log with Razorpay payout ID
          if (razorpayResult?.id) {
            await admin
              .from('payout_logs')
              .update({
                reference_id: razorpayResult.id,
                status: razorpayResult.status === 'processed' ? 'completed' : 'processing',
              })
              .eq('reference_id', referenceId);
          }
        }
      } catch (rzErr) {
        console.error('Razorpay payout error (non-fatal):', rzErr);
        // Payout record already created with 'processing' status — admin will process manually
      }
    }

    return createResponse({
      referenceId,
      amount: parsed.amount,
      method: parsed.method,
      status: 'processing',
      message: 'Withdrawal request submitted. Amount will be credited within 24 hours.',
      razorpay_id: razorpayResult?.id ?? null,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return createErrorResponse('Validation error', 400, error.flatten().fieldErrors);
    }
    return handleApiError(error);
  }
}

// ── GET: Fetch withdrawal history ─────────────────────────────────────────────
export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const userId = await getAuthUserId(request as any, supabase);
    if (!userId) return createErrorResponse('Not authenticated', 401);

    const admin = createAdminClient();

    const { data: payouts, error } = await admin
      .from('payout_logs')
      .select('*')
      .eq('worker_id', userId)
      .order('created_at', { ascending: false })
      .limit(20);

    if (error) throw error;

    return createResponse({ payouts: payouts ?? [] });
  } catch (error) {
    return handleApiError(error);
  }
}
