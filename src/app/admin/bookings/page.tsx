'use client';

import React from 'react';
import dynamic from 'next/dynamic';
import { Calendar, Loader2 } from 'lucide-react';

const BookingsManagement = dynamic(
  () => import('@/components/admin/BookingsManagement').then((mod) => mod.BookingsManagement),
  {
    loading: () => (
      <div className="flex items-center justify-center py-20 gap-3 bg-white/3 border border-white/8 rounded-2xl">
        <Loader2 className="animate-spin text-violet-400" size={24} />
        <p className="text-white/40 font-bold text-sm">Loading bookings management panel...</p>
      </div>
    ),
    ssr: false,
  }
);

export default function BookingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <p className="text-[11px] font-black uppercase tracking-widest text-white/40 mb-1">Control</p>
        <h1 className="text-2xl font-black text-white tracking-tight flex items-center gap-2">
          <Calendar size={20} className="text-violet-400" /> Booking Control
        </h1>
      </div>
      <BookingsManagement />
    </div>
  );
}
