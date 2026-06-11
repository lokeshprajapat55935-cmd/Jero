import { PaymentOrder, RazorpayVerifyPayload, PaymentVerificationResult } from './types';

export interface PaymentProvider {
  createOrder(bookingId: string, amount: number, currency?: string): Promise<PaymentOrder>;
  verifyPayment(payload: RazorpayVerifyPayload): Promise<PaymentVerificationResult>;
  verifyWebhookSignature(rawBody: string, signature: string): boolean;
}
