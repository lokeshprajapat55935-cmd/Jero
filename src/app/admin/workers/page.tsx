'use client';

import React from 'react';
import dynamic from 'next/dynamic';
import { Wrench, Loader2 } from 'lucide-react';

const WorkerModeration = dynamic(
  () => import('@/components/admin/WorkerModeration').then((mod) => mod.WorkerModeration),
  {
    loading: () => (
      <div className="flex items-center justify-center py-20 gap-3 bg-white/3 border border-white/8 rounded-2xl">
        <Loader2 className="animate-spin text-violet-400" size={24} />
        <p className="text-white/40 font-bold text-sm">Loading worker registry panel...</p>
      </div>
    ),
    ssr: false,
  }
);

export default function WorkersPage() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-black uppercase tracking-widest text-white/40 mb-1">Management</p>
          <h1 className="text-2xl font-black text-white tracking-tight flex items-center gap-2">
            <Wrench size={20} className="text-violet-400" />
            Worker Registry
          </h1>
        </div>
        <div className="text-xs text-white/30 font-semibold">
          Approve, suspend, and manage service partners
        </div>
      </div>

      {/* Existing WorkerModeration component */}
      <WorkerModeration />
    </div>
  );
}
