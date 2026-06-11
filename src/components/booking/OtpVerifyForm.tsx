'use client';

import React, { useState } from 'react';
import { KeyRound, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface OtpVerifyFormProps {
  onVerify: (otp: string) => Promise<void>;
  isLoading?: boolean;
}

export function OtpVerifyForm({ onVerify, isLoading }: OtpVerifyFormProps) {
  const [otp, setOtp] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (otp.length < 4) return;
    await onVerify(otp);
  };

  return (
    <div className="bg-gray-900 rounded-2xl p-5">
      <div className="flex items-center gap-2 mb-4">
        <div className="bg-emerald-500 p-1.5 rounded-lg">
          <KeyRound className="w-4 h-4 text-white" />
        </div>
        <p className="text-white font-bold text-sm">Enter Customer OTP</p>
      </div>
      <p className="text-gray-400 text-xs mb-4">
        Ask the customer for the OTP code displayed on their app. This verifies job completion.
      </p>

      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          type="text"
          inputMode="numeric"
          maxLength={6}
          value={otp}
          onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
          placeholder="Enter OTP"
          className="flex-1 h-12 bg-gray-800 border-transparent text-white text-center text-xl font-black tracking-[0.2em] rounded-xl focus:ring-2 focus:ring-emerald-500 placeholder:text-gray-600"
          disabled={isLoading}
        />
        <Button
          type="submit"
          disabled={isLoading || otp.length < 4}
          className="h-12 px-5 bg-emerald-500 hover:bg-emerald-600 rounded-xl font-bold"
        >
          <ArrowRight className="w-5 h-5" />
        </Button>
      </form>
    </div>
  );
}
