import { PaymentProvider } from './provider';
import { PaymentOrder, RazorpayVerifyPayload, PaymentVerificationResult } from './types';
import crypto from 'crypto';
import logger from '@/lib/logger';

export class RazorpayPaymentProvider implements PaymentProvider {
  private keyId: string;
  private keySecret: string;
  private webhookSecret: string;

  constructor(keyId?: string, keySecret?: string, webhookSecret?: string) {
    this.keyId = keyId || process.env.NEXT_PUBLIC_PAYMENT_KEY || 'mock-payment-key';
    this.keySecret = keySecret || process.env.PAYMENT_SECRET || 'mock-payment-secret';
    this.webhookSecret = webhookSecret || process.env.PAYMENT_WEBHOOK_SECRET || 'mock-webhook-secret';
  }

  private isMockMode(): boolean {
    return (
      this.keyId.startsWith('mock-') ||
      this.keySecret.startsWith('mock-') ||
      process.env.NODE_ENV !== 'production'
    );
  }

  async createOrder(bookingId: string, amount: number, currency: string = 'INR'): Promise<PaymentOrder> {
    const amountInPaise = Math.round(amount * 100);

    if (this.isMockMode()) {
      logger.info(`[Payment Mock] Creating mock order for booking ${bookingId} with amount ₹${amount}`);
      const mockOrderId = `order_mock_${Math.random().toString(36).substring(2, 15)}`;
      return {
        id: mockOrderId,
        amount: amountInPaise,
        currency,
        status: 'created',
        receipt: `receipt_${bookingId.substring(0, 8)}`,
        createdAt: Date.now(),
      };
    }

    try {
      // Production call to Razorpay API using standard fetch (no SDK required)
      const auth = Buffer.from(`${this.keyId}:${this.keySecret}`).toString('base64');
      const response = await fetch('https://api.razorpay.com/v1/orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Basic ${auth}`,
        },
        body: JSON.stringify({
          amount: amountInPaise,
          currency,
          receipt: `receipt_${bookingId.substring(0, 8)}`,
          notes: { bookingId },
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Razorpay API error: ${response.status} - ${errorText}`);
      }

      const order = await response.json();
      return {
        id: order.id,
        amount: order.amount,
        currency: order.currency,
        status: 'created',
        receipt: order.receipt,
        createdAt: order.created_at * 1000,
      };
    } catch (error) {
      logger.error('[Payment Error] Failed to create Razorpay order:', error);
      throw error;
    }
  }

  async verifyPayment(payload: RazorpayVerifyPayload): Promise<PaymentVerificationResult> {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = payload;

    if (this.isMockMode()) {
      // In mock mode, allow any verification signature if it starts with mock- or matches expectation
      logger.info(`[Payment Mock] Verifying mock payment for order ${razorpay_order_id}`);
      if (razorpay_signature === 'mock-payment-signature' || razorpay_order_id.startsWith('order_mock_')) {
        return { success: true };
      }
    }

    try {
      const generatedSignature = crypto
        .createHmac('sha256', this.keySecret)
        .update(`${razorpay_order_id}|${razorpay_payment_id}`)
        .digest('hex');

      if (generatedSignature === razorpay_signature) {
        return { success: true };
      }

      return {
        success: false,
        message: 'Invalid payment signature. Verification failed.',
      };
    } catch (error) {
      logger.error('[Payment Error] Failed to verify Razorpay signature:', error);
      return {
        success: false,
        message: 'Signature verification system error.',
      };
    }
  }

  verifyWebhookSignature(rawBody: string, signature: string): boolean {
    if (this.isMockMode() && signature === 'mock-webhook-signature') {
      logger.info('[Payment Mock] Webhook signature verified in mock mode');
      return true;
    }

    try {
      const expectedSignature = crypto
        .createHmac('sha256', this.webhookSecret)
        .update(rawBody)
        .digest('hex');

      return expectedSignature === signature;
    } catch (error) {
      logger.error('[Payment Error] Failed to verify webhook signature:', error);
      return false;
    }
  }
}
