import { createAdminClient } from '@/lib/supabase/admin';
import { createResponse, createErrorResponse } from '@/lib/api-utils';
import crypto from 'crypto';
import { NextResponse } from 'next/server';

const PHONEPE_SALT_KEY = process.env.PHONEPE_SALT_KEY || '';
const PHONEPE_SALT_INDEX = process.env.PHONEPE_SALT_INDEX || '1';
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

function sha256(payload: string): string {
  return crypto.createHash('sha256').update(payload).digest('hex');
}

function verifyChecksum(base64Response: string, receivedChecksum: string): boolean {
  const endpoint = '/pg/v1/callback';
  const expected = `${sha256(`${base64Response}${endpoint}${PHONEPE_SALT_KEY}`)}###${PHONEPE_SALT_INDEX}`;
  return expected === receivedChecksum;
}

// ── POST: PhonePe payment callback ────────────────────────────────────────────
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const formData = body ? null : await request.formData().catch(() => null);

    const response64 = body?.response || formData?.get('response');
    const checksum = request.headers.get('X-VERIFY') || body?.checksum || formData?.get('checksum');

    if (!response64) {
      return NextResponse.redirect(`${APP_URL}/worker/earnings?payment=failed&reason=no_response`);
    }

    // Verify checksum if PhonePe sends it
    if (checksum && PHONEPE_SALT_KEY) {
      const valid = verifyChecksum(response64, checksum as string);
      if (!valid) {
        return NextResponse.redirect(`${APP_URL}/worker/earnings?payment=failed&reason=checksum_mismatch`);
      }
    }

    // Decode response
    const decoded = JSON.parse(Buffer.from(response64, 'base64').toString('utf-8'));
    const { merchantTransactionId, transactionId: phonePeTxnId, amount: amountPaise, code } = decoded;

    const isSuccess = code === 'PAYMENT_SUCCESS';
    const adminClient = createAdminClient();

    if (isSuccess && merchantTransactionId && amountPaise) {
      // Extract worker_id from merchantTransactionId (ZOLVO_<userId16chars>_<timestamp>)
      // We'll look it up from the pending transaction
      const { data: pendingTx } = await adminClient
        .from('wallet_transactions')
        .select('worker_id, amount')
        .eq('reference_id', merchantTransactionId)
        .eq('type', 'pending_recharge')
        .maybeSingle();

      if (pendingTx) {
        const amount = pendingTx.amount;
        const workerId = pendingTx.worker_id;

        // Credit wallet using existing RPC
        const { error: rpcError } = await adminClient.rpc('topup_worker_wallet', {
          p_worker_id: workerId,
          p_amount: amount,
          p_description: `PhonePe payment ₹${amount} — Ref: ${phonePeTxnId || merchantTransactionId}`,
        });

        if (!rpcError) {
          // Update pending transaction to completed
          await adminClient
            .from('wallet_transactions')
            .update({
              type: 'recharge',
              description: `PhonePe top-up ₹${amount} — Success`,
            })
            .eq('reference_id', merchantTransactionId)
            .eq('type', 'pending_recharge');

          return NextResponse.redirect(
            `${APP_URL}/worker/earnings?payment=success&amount=${amount}`
          );
        }
      }
    }

    // Mark pending transaction as failed
    if (merchantTransactionId) {
      await adminClient
        .from('wallet_transactions')
        .delete()
        .eq('reference_id', merchantTransactionId)
        .eq('type', 'pending_recharge');
    }

    return NextResponse.redirect(`${APP_URL}/worker/earnings?payment=failed&reason=payment_not_successful`);
  } catch (error) {
    console.error('PhonePe callback error:', error);
    return NextResponse.redirect(`${APP_URL}/worker/earnings?payment=failed&reason=server_error`);
  }
}
