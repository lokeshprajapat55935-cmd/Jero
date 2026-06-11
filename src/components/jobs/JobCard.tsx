'use client';

import React from 'react';
import { Booking } from '@/types';
import { MapPin, Clock, Banknote, Zap, ChevronRight, User } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  broadcasting: { label: 'New Request', color: 'bg-blue-100 text-blue-700' },
  accepted: { label: 'Accepted', color: 'bg-emerald-100 text-emerald-700' },
  worker_arriving: { label: 'En Route', color: 'bg-indigo-100 text-indigo-700' },
  work_started: { label: 'In Progress', color: 'bg-amber-100 text-amber-700' },
  work_completed: { label: 'Work Done', color: 'bg-teal-100 text-teal-700' },
  otp_generated: { label: 'Awaiting OTP', color: 'bg-purple-100 text-purple-700' },
  completed: { label: 'Completed', color: 'bg-gray-100 text-gray-600' },
  cancelled: { label: 'Cancelled', color: 'bg-red-100 text-red-600' },
};

interface JobCardProps {
  job: Booking;
  onAccept?: (id: string) => void;
  isAccepting?: boolean;
}

export function JobCard({ job, onAccept, isAccepting }: JobCardProps) {
  const router = useRouter();
  const statusInfo = STATUS_CONFIG[job.status] ?? { label: job.status, color: 'bg-gray-100 text-gray-600' };
  const clientName = (job.client as any)?.profile?.full_name ?? 'Customer';
  const isNew = job.status === 'broadcasting';

  const handleClick = () => {
    router.push(`/partner/jobs/${job.id}`);
  };

  return (
    <div
      onClick={handleClick}
      className={cn(
        "bg-white rounded-2xl border shadow-sm overflow-hidden cursor-pointer transition-all active:scale-[0.99]",
        isNew ? "border-blue-200 shadow-blue-50" : "border-gray-100"
      )}
    >
      {isNew && (
        <div className="bg-blue-600 px-4 py-1.5 flex items-center gap-1.5">
          <Zap className="w-3.5 h-3.5 text-blue-100" />
          <p className="text-xs font-bold text-blue-100 uppercase tracking-widest">New Job Request</p>
        </div>
      )}

      <div className="p-4">
        {/* Header */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-lg font-black text-gray-900">{job.category}</span>
              <span className={cn("text-xs font-bold px-2 py-0.5 rounded-full", statusInfo.color)}>
                {statusInfo.label}
              </span>
            </div>
            <p className="text-sm text-gray-500 line-clamp-1">{job.description}</p>
          </div>
          <ChevronRight className="w-5 h-5 text-gray-300 shrink-0 mt-1" />
        </div>

        {/* Details */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <User className="w-4 h-4 text-gray-400 shrink-0" />
            <span className="font-medium">{clientName}</span>
          </div>
          <div className="flex items-start gap-2 text-sm text-gray-600">
            <MapPin className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" />
            <span className="line-clamp-2 font-medium">{job.location_address ?? 'Location not specified'}</span>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <Clock className="w-4 h-4 text-gray-400 shrink-0" />
              <span className="font-medium">
                {new Date(job.created_at).toLocaleString('en-IN', {
                  day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
                })}
              </span>
            </div>
            <div className="flex items-center gap-1 bg-emerald-50 text-emerald-700 px-2.5 py-1 rounded-full">
              <Banknote className="w-3.5 h-3.5" />
              <span className="text-xs font-black">₹{(job.service_charge ?? job.total_price ?? 0).toLocaleString('en-IN')}</span>
            </div>
          </div>
        </div>

        {/* Accept Button for New Jobs */}
        {isNew && onAccept && (
          <button
            onClick={(e) => { e.stopPropagation(); onAccept(job.id); }}
            disabled={isAccepting}
            className="mt-4 w-full h-11 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-sm transition-colors active:scale-[0.98] disabled:opacity-50"
          >
            {isAccepting ? 'Accepting...' : 'Accept Job'}
          </button>
        )}
      </div>
    </div>
  );
}
