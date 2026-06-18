"use client";

import React from 'react';
import { ShieldCheck, Receipt, Lock, PhoneCall } from 'lucide-react';

export function WhyChooseZolvo() {
  const features = [
    {
      icon: <ShieldCheck size={20} className="text-blue-600" />,
      bg: 'bg-blue-50 border-blue-100/30',
      title: 'Verified Professionals',
      desc: 'Background checked, certified, and trained experts.',
    },
    {
      icon: <Receipt size={20} className="text-amber-600" />,
      bg: 'bg-amber-50 border-amber-100/30',
      title: 'Transparent Pricing',
      desc: 'No hidden charges. Standardized rates for every job.',
    },
    {
      icon: <Lock size={20} className="text-emerald-600" />,
      bg: 'bg-emerald-50 border-emerald-100/30',
      title: 'OTP Secure Completion',
      desc: 'Jobs are completed only when you verify with OTP.',
    },
    {
      icon: <PhoneCall size={20} className="text-indigo-600" />,
      bg: 'bg-indigo-50 border-indigo-100/30',
      title: 'Quick Support',
      desc: 'Dedicated support team to resolve queries instantly.',
    },
  ];

  return (
    <div className="px-4 py-6">
      <div className="mb-4">
        <h2 className="text-lg font-black text-gray-900">Why Choose JERO?</h2>
        <p className="text-xs font-semibold text-gray-400 mt-0.5">Your trust is our greatest commitment</p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {features.map((feature, idx) => (
          <div 
            key={idx} 
            className={`border rounded-[24px] p-4 flex flex-col items-start ${feature.bg} shadow-sm`}
          >
            <div className="p-2.5 rounded-xl bg-white shadow-sm mb-3">
              {feature.icon}
            </div>
            <h3 className="font-extrabold text-gray-900 text-sm mb-1 leading-tight">
              {feature.title}
            </h3>
            <p className="text-[11px] font-medium text-gray-500 leading-snug">
              {feature.desc}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
