'use client';

import React from 'react';
import { Booking } from '@/types';
import {
  CheckCircle2, Clock, Truck, Wrench, ShieldCheck,
  CreditCard, Package, Circle, Home
} from 'lucide-react';
import { cn } from '@/lib/utils';

const STEPS = [
  { status: 'pending', label: 'Booking Requested', icon: Clock },
  { status: 'broadcasting', label: 'Searching Worker', icon: Clock },
  { status: 'accepted', label: 'Worker Accepted', icon: CheckCircle2 },
  { status: 'en_route', label: 'Worker En Route', icon: Truck },
  { status: 'arrived', label: 'Worker Arrived', icon: Home },
  { status: 'started', label: 'Work In Progress', icon: Wrench },
  { status: 'awaiting_approval', label: 'Awaiting Approval', icon: ShieldCheck },
  { status: 'payment', label: 'Payment', icon: CreditCard },
  { status: 'otp_verification', label: 'OTP Verification', icon: ShieldCheck },
  { status: 'completed', label: 'Completed', icon: CheckCircle2 },
] as const;

const STATUS_STEP_INDEX: Record<string, number> = {
  pending: 0,
  broadcasting: 1,
  searching_worker: 1,
  accepted: 2,
  assigned: 2,
  en_route: 3,
  worker_arriving: 3,
  arrived: 4,
  started: 5,
  work_started: 5,
  in_progress: 5,
  awaiting_item_approval: 6,
  item_approved: 6,
  work_completed_pending_otp: 6,
  awaiting_payment: 7,
  payment_processing: 7,
  payment_verified: 7,
  otp_generated: 8,
  otp_verified: 8,
  completed: 9,
  cancelled: -2,
  disputed: -2,
  no_worker_available: -2,
};

interface BookingStatusTrackerProps {
  booking: Booking;
}

export function BookingStatusTracker({ booking }: BookingStatusTrackerProps) {
  const currentIndex = STATUS_STEP_INDEX[booking.status] ?? 0;
  const isCancelled = booking.status === 'cancelled' || booking.status === 'disputed';

  if (isCancelled) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-center">
        <p className="font-bold text-red-700 text-lg capitalize">
          Booking {booking.status}
        </p>
        <p className="text-sm text-red-500 mt-1">This booking is no longer active.</p>
      </div>
    );
  }

  return (
    <div className="relative">
      <div className="flex flex-col gap-0">
        {STEPS.map((step, idx) => {
          const isCompleted = idx < currentIndex;
          const isActive = idx === currentIndex;
          const Icon = step.icon;

          return (
            <div key={step.status} className="flex items-start gap-4">
              {/* Icon Column */}
              <div className="flex flex-col items-center shrink-0 w-8">
                <div className={cn(
                  "w-8 h-8 rounded-full flex items-center justify-center border-2 transition-all z-10",
                  isCompleted && "bg-emerald-500 border-emerald-500",
                  isActive && "bg-blue-600 border-blue-600 ring-4 ring-blue-100",
                  !isCompleted && !isActive && "bg-white border-gray-200"
                )}>
                  {isCompleted ? (
                    <CheckCircle2 className="w-4 h-4 text-white" />
                  ) : (
                    <Icon className={cn(
                      "w-4 h-4",
                      isActive ? "text-white" : "text-gray-300"
                    )} />
                  )}
                </div>
                {idx < STEPS.length - 1 && (
                  <div className={cn(
                    "w-0.5 h-8 mt-0.5",
                    isCompleted ? "bg-emerald-400" : "bg-gray-100"
                  )} />
                )}
              </div>

              {/* Label Column */}
              <div className="pb-6 pt-1">
                <p className={cn(
                  "text-sm font-bold leading-tight",
                  isActive && "text-blue-700",
                  isCompleted && "text-emerald-600",
                  !isActive && !isCompleted && "text-gray-400"
                )}>
                  {step.label}
                </p>
                {isActive && (
                  <p className="text-xs text-gray-400 mt-0.5 animate-pulse">In progress...</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
