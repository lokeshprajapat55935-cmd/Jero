import React from 'react';
import { useRouter } from 'next/navigation';
import { Activity, Clock, ChevronRight } from 'lucide-react';
import type { ActiveBookingPreview } from '@/services/home';

interface ActiveBookingCardProps {
  booking: ActiveBookingPreview;
}

export function ActiveBookingCard({ booking }: ActiveBookingCardProps) {
  const router = useRouter();

  if (!booking) return null;

  // Derive simple human readable status
  const getStatusText = (status: string) => {
    switch (status) {
      case 'pending':
      case 'broadcasting': return 'Finding a professional...';
      case 'accepted': return 'Professional assigned';
      case 'worker_arriving': return 'Professional is on the way';
      case 'arrived': return 'Professional arrived';
      case 'work_started':
      case 'in_progress': return 'Work in progress';
      case 'awaiting_payment':
      case 'payment_processing': return 'Awaiting payment';
      default: return 'Booking active';
    }
  };

  return (
    <div className="px-4 py-2 mb-2">
      <div 
        onClick={() => router.push(`/booking/${booking.id}`)}
        className="bg-gray-900 rounded-[20px] p-4 flex items-center justify-between cursor-pointer active:scale-[0.98] transition-transform shadow-lg"
      >
        <div className="flex items-center gap-4">
          <div className="relative flex items-center justify-center w-10 h-10 rounded-full bg-gray-800 border border-gray-700">
            <Activity size={18} className="text-blue-400" />
            <div className="absolute inset-0 rounded-full border-2 border-blue-500/30 animate-ping" />
          </div>
          <div className="flex flex-col">
            <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-0.5">
              Live Tracking
            </span>
            <span className="text-sm font-black text-white">
              {getStatusText(booking.status)}
            </span>
          </div>
        </div>
        
        <div className="w-8 h-8 rounded-full bg-gray-800 flex items-center justify-center">
          <ChevronRight size={16} className="text-gray-400" />
        </div>
      </div>
    </div>
  );
}
