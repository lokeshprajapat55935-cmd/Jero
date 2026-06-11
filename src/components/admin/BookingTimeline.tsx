'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import type { BookingTimeline as BookingTimelineType } from '@/types';
import { CheckCircle2, Clock, Loader2, AlertTriangle, XCircle, LockKeyhole, Smartphone } from 'lucide-react';

interface BookingTimelineProps {
  timeline: BookingTimelineType[];
  className?: string;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  pending: { label: 'Booking Created', color: 'text-blue-400', icon: Clock },
  broadcasting: { label: 'Finding Worker', color: 'text-violet-400', icon: Loader2 },
  accepted: { label: 'Worker Accepted', color: 'text-emerald-400', icon: CheckCircle2 },
  arrived: { label: 'Worker Arrived', color: 'text-cyan-400', icon: CheckCircle2 },
  in_progress: { label: 'Work In Progress', color: 'text-amber-400', icon: Loader2 },
  awaiting_otp: { label: 'Awaiting OTP Verification', color: 'text-violet-400', icon: Smartphone },
  otp_verified: { label: 'OTP Verified', color: 'text-emerald-400', icon: CheckCircle2 },
  awaiting_payment: { label: 'Payment Pending', color: 'text-amber-400', icon: LockKeyhole },
  payment_processing: { label: 'Processing Payment', color: 'text-blue-400', icon: Loader2 },
  payment_verified: { label: 'Payment Verified', color: 'text-emerald-400', icon: CheckCircle2 },
  completed: { label: 'Completed', color: 'text-emerald-400', icon: CheckCircle2 },
  paid_completed: { label: 'Paid & Completed', color: 'text-emerald-500', icon: CheckCircle2 },
  cancelled: { label: 'Cancelled', color: 'text-red-400', icon: XCircle },
  disputed: { label: 'Disputed', color: 'text-red-500', icon: AlertTriangle },
};

export function BookingTimeline({ timeline, className }: BookingTimelineProps) {
  if (!timeline || timeline.length === 0) {
    return (
      <div className="text-center py-6 text-white/30 text-xs font-semibold">
        No timeline events recorded.
      </div>
    );
  }

  return (
    <div className={cn('relative space-y-0', className)}>
      {timeline.map((event, index) => {
        const config = STATUS_CONFIG[event.status] || {
          label: event.status.replace(/_/g, ' '),
          color: 'text-white/40',
          icon: Clock,
        };
        const Icon = config.icon;
        const isLast = index === timeline.length - 1;

        return (
          <div key={event.id} className="flex gap-3">
            {/* Connector */}
            <div className="flex flex-col items-center">
              <div className={cn('h-7 w-7 rounded-full border-2 flex items-center justify-center shrink-0 bg-[#0f0f13]',
                isLast ? 'border-white/20' : 'border-white/10'
              )}>
                <Icon size={13} className={config.color} />
              </div>
              {!isLast && <div className="w-px flex-1 bg-white/8 mt-1 mb-1 min-h-[12px]" />}
            </div>

            {/* Event details */}
            <div className={cn('pb-4 min-w-0 flex-1', isLast && 'pb-0')}>
              <p className={cn('text-xs font-black capitalize', config.color)}>{config.label}</p>
              {event.reason && (
                <p className="text-[10px] text-white/40 font-semibold mt-0.5 truncate">
                  Note: {event.reason}
                </p>
              )}
              <p className="text-[10px] text-white/25 font-semibold mt-0.5">
                {new Date(event.created_at).toLocaleString('en-IN', {
                  day: '2-digit',
                  month: 'short',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
