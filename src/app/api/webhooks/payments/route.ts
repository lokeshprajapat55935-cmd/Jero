import { NextRequest } from 'next/server';
import { getPaymentProvider } from '@/lib/payments/factory';
import { createAdminClient } from '@/lib/supabase/admin';
import { createResponse, createErrorResponse } from '@/lib/api-utils';
import logger from '@/lib/logger';

export async function POST(request: NextRequest) {
  const admin = createAdminClient();
  const rawBody = await request.text();
  const signature = request.headers.get('x-razorpay-signature') || '';

  const provider = getPaymentProvider();

  // 1. Verify webhook signature
  if (!provider.verifyWebhookSignature(rawBody, signature)) {
    logger.warn('[Webhook Warning] Invalid webhook signature detected');
    return createErrorResponse('Invalid signature', 400);
  }

  let event;
  try {
    event = JSON.parse(rawBody);
  } catch (e) {
    return createErrorResponse('Invalid JSON body', 400);
  }

  const eventId = event.id;
  const eventType = event.event;

  if (!eventId) {
    return createErrorResponse('Missing event ID', 400);
  }

  // 2. Idempotency Check: prevent duplicate event processing
  const { data: existingLog, error: fetchErr } = await admin
    .from('payment_webhook_logs')
    .select('id, processed')
    .eq('event_id', eventId)
    .maybeSingle();

  if (fetchErr) {
    logger.error('[Webhook Error] Idempotency fetch check failed:', fetchErr);
    return createErrorResponse('Database error', 500);
  }

  if (existingLog) {
    if (existingLog.processed) {
      logger.info(`[Webhook Info] Event ${eventId} already processed, skipping`);
      return createResponse({ success: true, duplicated: true });
    }
    // Attempting re-process
  } else {
    // Save initial webhook log
    const { error: insertErr } = await admin.from('payment_webhook_logs').insert({
      gateway: 'razorpay',
      event_id: eventId,
      event_type: eventType,
      payload: event,
      processed: false,
    });

    if (insertErr) {
      logger.error('[Webhook Error] Failed to log webhook payload:', insertErr);
      return createErrorResponse('Logging failure', 500);
    }
  }

  // 3. Process payment events
  if (eventType === 'payment.captured' || eventType === 'order.paid') {
    const paymentEntity = event.payload?.payment?.entity || event.payload?.order?.entity;
    const orderId = paymentEntity?.order_id || paymentEntity?.id;
    const bookingId = paymentEntity?.notes?.bookingId;

    logger.info(`[Webhook Info] Processing successful payment event for Order: ${orderId}, Booking: ${bookingId}`);

    if (!orderId && !bookingId) {
      const errMsg = 'Missing order_id and bookingId parameters in payload';
      await markWebhookFailed(admin, eventId, errMsg);
      return createErrorResponse(errMsg, 400);
    }

    try {
      // Find the booking
      let booking;
      if (bookingId) {
        const { data } = await admin.from('bookings').select('*').eq('id', bookingId).maybeSingle();
        booking = data;
      } else {
        const { data } = await admin.from('bookings').select('*').eq('payment_reference', orderId).maybeSingle();
        booking = data;
      }

      if (!booking) {
        const errMsg = `Associated booking not found for Order ID ${orderId}`;
        await markWebhookFailed(admin, eventId, errMsg);
        return createErrorResponse(errMsg, 404);
      }

      // If already paid, skip to avoid double deductions / wallet additions
      if (booking.status === 'completed') {
        logger.info(`[Webhook Info] Booking ${booking.id} is already in completed state. Marking webhook as processed.`);
        await markWebhookSuccess(admin, eventId);
        return createResponse({ success: true, status: 'already_completed' });
      }

      // Execute atomic credit payout (zero commission)
      const { data: creditResult, error: creditErr } = await admin.rpc('process_online_payment_credit', {
        p_booking_id: booking.id,
      });

      if (creditErr) {
        throw creditErr;
      }

      const result = creditResult as { success: boolean; reason?: string };
      if (!result?.success) {
        throw new Error(result?.reason || 'Online payout processing RPC failure');
      }

      // Insert audit record
      await admin.from('financial_audit_logs').insert({
        booking_id: booking.id,
        action: 'online_credit_process',
        amount: Number(booking.total_price),
        notes: `Webhook event ${eventId} processed payment reference: ${orderId}`,
      });

      await markWebhookSuccess(admin, eventId);
      logger.info(`[Webhook Success] Atomically processed payment & payout for booking ${booking.id}`);

    } catch (err: any) {
      const errMsg = err.message || 'Error executing webhook payouts';
      logger.error(`[Webhook Error] Processing failure: ${errMsg}`);
      await markWebhookFailed(admin, eventId, errMsg);
      return createErrorResponse(errMsg, 500);
    }
  } else {
    // Unhandled event types: mark as processed immediately (ignored)
    await markWebhookSuccess(admin, eventId);
  }

  return createResponse({ success: true });
}

async function markWebhookSuccess(admin: any, eventId: string) {
  await admin
    .from('payment_webhook_logs')
    .update({ processed: true, updated_at: new Date().toISOString() })
    .eq('event_id', eventId);
}

async function markWebhookFailed(admin: any, eventId: string, errorMsg: string) {
  await admin
    .from('payment_webhook_logs')
    .update({ processed: false, error_message: errorMsg, updated_at: new Date().toISOString() })
    .eq('event_id', eventId);
}
