'use client';

import React from 'react';
import { ShieldCheck, Copy } from 'lucide-react';
import { Booking } from '@/types';
import toast from 'react-hot-toast';

interface OtpDisplayCardProps {
  booking: Booking;
}

export function OtpDisplayCard({ booking }: OtpDisplayCardProps) {
  const otp = booking.otp_code;
  if (!otp) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(otp).then(() => {
      toast.success('OTP copied!');
    });
  };

  return (
    <div className="bg-blue-50 border-2 border-blue-200 rounded-2xl p-5">
      <div className="flex items-center gap-2 mb-3">
        <div className="bg-blue-600 p-1.5 rounded-lg">
          <ShieldCheck className="w-4 h-4 text-white" />
        </div>
        <p className="text-blue-900 font-bold text-sm">Share this OTP with your worker</p>
      </div>

      <div className="flex items-center justify-between bg-white border border-blue-200 rounded-xl px-4 py-3 mb-3">
        <span className="text-3xl font-black tracking-[0.3em] text-blue-900 font-mono">
          {otp}
        </span>
        <button
          onClick={handleCopy}
          className="p-2 text-blue-500 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors"
        >
          <Copy className="w-5 h-5" />
        </button>
      </div>

      <p className="text-xs text-blue-600 font-medium">
        ⚠️ Only share this after you are fully satisfied with the work. This OTP confirms completion and payment.
      </p>
    </div>
  );
}
