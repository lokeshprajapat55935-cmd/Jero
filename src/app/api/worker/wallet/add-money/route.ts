import { withApiErrorHandler, ApiError } from '@/lib/api-error';
import { createResponse } from '@/lib/api-utils';
import { requireWorker } from '@/lib/auth/server-guard';
import { z } from 'zod';
import crypto from 'crypto';

const PHONEPE_MERCHANT_ID = process.env.PHONEPE_MERCHANT_ID || 'MERCHANTID';
const PHONEPE_SALT_KEY = process.env.PHONEPE_SALT_KEY || '';
const PHONEPE_SALT_INDEX = process.env.PHONEPE_SALT_INDEX || '1';
const PHONEPE_BASE_URL =
  process.env.NODE_ENV === 'production'
    ? 'https://api.phonepe.com/apis/hermes'
    : 'https://api-preprod.phonepe.com/apis/pg-sandbox';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

const addMoneySchema = z.object({
  amount: z
    .number({ message: 'Amount is required' })
    .min(100, 'Minimum add amount is ₹100')
    .max(50000, 'Maximum add amount is ₹50,000'),
});

function sha256(payload: string): string {
  return crypto.createHash('sha256').update(payload).digest('hex');
}

function buildChecksum(base64Payload: string, endpoint: string): string {
  return `${sha256(`${base64Payload}${endpoint}${PHONEPE_SALT_KEY}`)}###${PHONEPE_SALT_INDEX}`;
}

export const POST = withApiErrorHandler(async (request: Request) => {
  const { user, admin } = await requireWorker();

  const body = await request.json();
  const { amount } = addMoneySchema.parse(body);

  const amountInPaise = Math.round(amount * 100);
  const transactionId = `ZOLVO_ADD_${user.id.replace(/-/g, '').slice(0, 16)}_${Date.now()}`;

  const redirectUrl = `${APP_URL}/api/worker/phonepe/callback`;
  const callbackUrl = `${APP_URL}/api/worker/phonepe/callback`;

  const payload = {
    merchantId: PHONEPE_MERCHANT_ID,
    merchantTransactionId: transactionId,
    merchantUserId: `ZOLVO_USR_${user.id.replace(/-/g, '').slice(0, 16)}`,
    amount: amountInPaise,
    redirectUrl,
    redirectMode: 'POST',
    callbackUrl,
    paymentInstrument: { type: 'PAY_PAGE' },
  };

  const base64Payload = Buffer.from(JSON.stringify(payload)).toString('base64');
  const endpoint = '/pg/v1/pay';
  const checksum = buildChecksum(base64Payload, endpoint);

  // Record pending transaction in DB
  await admin.from('wallet_transactions').insert({
    worker_id: user.id,
    type: 'pending_recharge',
    amount,
    balance_after: 0,
    description: `PhonePe top-up of ₹${amount} — TxnID: ${transactionId}`,
    reference_id: transactionId,
  });

  // Call PhonePe
  const response = await fetch(`${PHONEPE_BASE_URL}${endpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-VERIFY': checksum,
      'X-MERCHANT-ID': PHONEPE_MERCHANT_ID,
    },
    body: JSON.stringify({ request: base64Payload }),
  });

  const result = await response.json();

  if (!result.success) {
    throw new ApiError(
      400,
      result.message || 'Failed to initiate payment. Please try again.'
    );
  }

  const paymentUrl = result.data?.instrumentResponse?.redirectInfo?.url;
  if (!paymentUrl) {
    throw new ApiError(502, 'Payment gateway did not return a redirect URL. Please try again.');
  }

  return createResponse({
    transactionId,
    paymentUrl,
    message: 'Payment session initiated successfully',
  });
});
