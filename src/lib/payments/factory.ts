import { RazorpayPaymentProvider } from './razorpay';
import { PaymentProvider } from './provider';

let paymentProviderInstance: PaymentProvider | null = null;

export function getPaymentProvider(): PaymentProvider {
  if (!paymentProviderInstance) {
    paymentProviderInstance = new RazorpayPaymentProvider(
      process.env.NEXT_PUBLIC_PAYMENT_KEY,
      process.env.PAYMENT_SECRET,
      process.env.PAYMENT_WEBHOOK_SECRET
    );
  }
  return paymentProviderInstance;
}
