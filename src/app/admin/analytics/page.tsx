'use client';

import React from 'react';
import dynamic from 'next/dynamic';
import { BarChart3, Loader2 } from 'lucide-react';

const AnalyticsDetailed = dynamic(
  () => import('@/components/admin/AnalyticsDetailed').then((mod) => mod.AnalyticsDetailed),
  {
    loading: () => (
      <div className="flex items-center justify-center py-20 gap-3 bg-white/3 border border-white/8 rounded-2xl">
        <Loader2 className="animate-spin text-violet-400" size={24} />
        <p className="text-white/40 font-bold text-sm">Loading analytics panel...</p>
      </div>
    ),
    ssr: false,
  }
);

export default function AnalyticsPage() {
  return (
    <div className="space-y-6">
      <div>
        <p className="text-[11px] font-black uppercase tracking-widest text-white/40 mb-1">Intelligence</p>
        <h1 className="text-2xl font-black text-white tracking-tight flex items-center gap-2">
          <BarChart3 size={20} className="text-violet-400" /> Analytics
        </h1>
      </div>
      <AnalyticsDetailed />
    </div>
  );
}
