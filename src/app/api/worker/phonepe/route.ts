import { createClient } from '@/lib/supabase/supabase-server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createResponse, createErrorResponse, handleApiError, getAuthUserId } from '@/lib/api-utils';
import { z } from 'zod';
import crypto from 'crypto';

// ── PhonePe Configuration ─────────────────────────────────────────────────────
const PHONEPE_MERCHANT_ID = process.env.PHONEPE_MERCHANT_ID || 'MERCHANTID';
const PHONEPE_SALT_KEY = process.env.PHONEPE_SALT_KEY || '';
const PHONEPE_SALT_INDEX = process.env.PHONEPE_SALT_INDEX || '1';
const PHONEPE_BASE_URL =
  process.env.NODE_ENV === 'production'
    ? 'https://api.phonepe.com/apis/hermes'
    : 'https://api-preprod.phonepe.com/apis/pg-sandbox';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

// ── Helpers ───────────────────────────────────────────────────────────────────
function sha256(payload: string): string {
  return crypto.createHash('sha256').update(payload).digest('hex');
}

function buildChecksum(base64Payload: string, endpoint: string): string {
  const string = `${base64Payload}${endpoint}${PHONEPE_SALT_KEY}`;
  return `${sha256(string)}###${PHONEPE_SALT_INDEX}`;
}

// ── Schemas ───────────────────────────────────────────────────────────────────
const initiateSchema = z.object({
  amount: z.number().min(10, 'Minimum ₹10').max(50000, 'Maximum ₹50,000'),
});

// ── POST: Initiate PhonePe payment ────────────────────────────────────────────
export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const userId = await getAuthUserId(request as any, supabase);
    if (!userId) return createErrorResponse('Not authenticated', 401);

    const body = await request.json();
    const { amount } = initiateSchema.parse(body);

    // Amount in paise (₹1 = 100 paise)
    const amountInPaise = Math.round(amount * 100);

    // Unique transaction ID
    const transactionId = `ZOLVO_${userId.replace(/-/g, '').slice(0, 16)}_${Date.now()}`;

    const redirectUrl = `${APP_URL}/api/worker/phonepe/callback`;
    const callbackUrl = `${APP_URL}/api/worker/phonepe/callback`;

    const payload = {
      merchantId: PHONEPE_MERCHANT_ID,
      merchantTransactionId: transactionId,
      merchantUserId: `ZOLVO_USR_${userId.replace(/-/g, '').slice(0, 16)}`,
      amount: amountInPaise,
      redirectUrl,
      redirectMode: 'POST',
      callbackUrl,
      mobileNumber: '', // optional
      paymentInstrument: {
        type: 'PAY_PAGE',
      },
    };

    const base64Payload = Buffer.from(JSON.stringify(payload)).toString('base64');
    const endpoint = '/pg/v1/pay';
    const checksum = buildChecksum(base64Payload, endpoint);

    // Store pending transaction in wallet_transactions for tracking
    const admin = createAdminClient();
    await admin.from('wallet_transactions').insert({
      worker_id: userId,
      type: 'pending_recharge',
      amount,
      description: `PhonePe top-up of ₹${amount} — TxnID: ${transactionId}`,
      reference_id: transactionId,
      balance_after: 0, // will be updated on callback
    });

    // Call PhonePe API
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
      return createErrorResponse(
        result.message || 'Failed to initiate payment',
        400
      );
    }

    const paymentUrl =
      result.data?.instrumentResponse?.redirectInfo?.url;

    return createResponse({
      transactionId,
      paymentUrl,
      message: 'Payment initiated successfully',
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return createErrorResponse('Validation error', 400, error.flatten().fieldErrors);
    }
    return handleApiError(error);
  }
}

// ── GET: Check payment status ─────────────────────────────────────────────────
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const transactionId = searchParams.get('transaction_id');
    if (!transactionId) return createErrorResponse('transaction_id required', 400);

    const supabase = await createClient();
    const userId = await getAuthUserId(request as any, supabase);
    if (!userId) return createErrorResponse('Not authenticated', 401);

    const endpoint = `/pg/v1/status/${PHONEPE_MERCHANT_ID}/${transactionId}`;
    const checksum = buildChecksum('', endpoint);

    const response = await fetch(`${PHONEPE_BASE_URL}${endpoint}`, {
      headers: {
        'Content-Type': 'application/json',
        'X-VERIFY': checksum,
        'X-MERCHANT-ID': PHONEPE_MERCHANT_ID,
      },
    });

    const result = await response.json();
    return createResponse(result);
  } catch (error) {
    return handleApiError(error);
  }
}
