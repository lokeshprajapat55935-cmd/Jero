'use client';

import React, { useState } from 'react';
import { Banknote, QrCode, CreditCard, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Booking } from '@/types';
import { cn } from '@/lib/utils';

interface PaymentSheetProps {
  booking: Booking;
  onConfirmPayment: (method: 'cash' | 'upi' | 'card', ref?: string) => Promise<void>;
  isLoading?: boolean;
}

const PAYMENT_ICONS = {
  cash: Banknote,
  upi: QrCode,
  card: CreditCard,
};

const PAYMENT_LABELS = {
  cash: 'Cash on Delivery',
  upi: 'UPI Payment',
  card: 'Card Payment',
};

export function PaymentSheet({ booking, onConfirmPayment, isLoading }: PaymentSheetProps) {
  const [upiRef, setUpiRef] = useState('');
  const method = (booking.payment_method ?? 'cash') as 'cash' | 'upi' | 'card';
  const Icon = PAYMENT_ICONS[method];
  const amount = booking.service_charge ?? booking.total_price ?? 0;

  const handleConfirm = () => {
    onConfirmPayment(method, method !== 'cash' ? upiRef : undefined);
  };

  return (
    <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
      {/* Header */}
      <div className="bg-gray-900 px-5 py-4">
        <p className="text-gray-400 text-xs font-bold uppercase tracking-widest mb-1">Amount Due</p>
        <p className="text-white text-4xl font-black">₹{amount.toLocaleString('en-IN')}</p>
        <p className="text-gray-500 text-xs mt-1">Service charge for {booking.category}</p>
      </div>

      {/* Payment Method */}
      <div className="p-5">
        <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Payment Method</p>
        <div className={cn(
          "flex items-center gap-3 p-4 rounded-xl border-2 mb-4",
          "border-blue-200 bg-blue-50"
        )}>
          <div className="bg-blue-600 p-2 rounded-lg">
            <Icon className="w-5 h-5 text-white" />
          </div>
          <div>
            <p className="font-bold text-blue-900">{PAYMENT_LABELS[method]}</p>
            <p className="text-xs text-blue-500">
              {method === 'cash' ? 'Pay the worker directly in cash' : 'Complete payment via your UPI app'}
            </p>
          </div>
        </div>

        {method === 'upi' && (
          <div className="mb-4">
            <label className="text-xs font-bold text-gray-500 uppercase tracking-wider block mb-2">
              UPI Transaction ID (optional)
            </label>
            <input
              type="text"
              value={upiRef}
              onChange={(e) => setUpiRef(e.target.value)}
              placeholder="e.g. 407812345678"
              className="w-full h-11 px-4 bg-gray-50 border-transparent rounded-xl text-sm font-medium focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
          </div>
        )}

        {method === 'cash' && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4">
            <p className="text-xs font-bold text-amber-800">
              💵 Please pay ₹{amount.toLocaleString('en-IN')} in cash to the worker before confirming.
            </p>
          </div>
        )}

        <Button
          onClick={handleConfirm}
          disabled={isLoading}
          className="w-full h-14 bg-gray-900 hover:bg-gray-800 text-white font-bold text-base rounded-xl flex items-center justify-center gap-2"
        >
          <CheckCircle2 className="w-5 h-5" />
          Confirm Payment
        </Button>
      </div>
    </div>
  );
}
