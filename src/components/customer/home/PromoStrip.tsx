"use client";

import React from 'react';
import { ShieldCheck } from 'lucide-react';

export function PromoStrip() {
  return (
    <div className="px-4 py-2">
      <div className="flex items-center justify-center gap-2 bg-emerald-50 border border-emerald-100/60 rounded-[14px] py-2.5 px-4 shadow-sm">
        <ShieldCheck size={16} className="text-emerald-600 fill-emerald-50/50 flex-shrink-0" />
        <span className="text-xs font-black text-emerald-800 tracking-wide">
          100% Verified Workers for your safety & peace of mind
        </span>
      </div>
    </div>
  );
}
