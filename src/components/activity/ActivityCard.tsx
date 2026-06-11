import React from 'react';
import { ActivityItem } from '@/services/activity.api';
import { Clock, MapPin, ChevronRight, Star, AlertCircle, CheckCircle2, RotateCcw } from 'lucide-react';
import { format } from 'date-fns';
import { useRouter } from 'next/navigation';

interface ActivityCardProps {
  activity: ActivityItem;
  onCancel: (id: string) => void;
  onRebook: (id: string) => void;
}

export function ActivityCard({ activity, onCancel, onRebook }: ActivityCardProps) {
  const router = useRouter();
  
  const formattedDate = format(new Date(activity.created_at), 'MMM d, yyyy • h:mm a');

  // Badge styles based on status
  let badgeColor = 'bg-gray-100 text-gray-700 border-gray-200';
  let Icon = Clock;
  let friendlyStatus = 'Pending';

  if (activity.status === 'completed' || activity.status === 'payment_verified' || activity.status === 'paid_completed') {
    badgeColor = 'bg-green-50 text-green-700 border-green-200';
    Icon = CheckCircle2;
    friendlyStatus = 'Completed';
  } else if (activity.status === 'cancelled') {
    badgeColor = 'bg-red-50 text-red-700 border-red-200';
    Icon = AlertCircle;
    friendlyStatus = 'Cancelled';
  } else if (activity.status === 'broadcasting') {
    badgeColor = 'bg-blue-50 text-blue-700 border-blue-200';
    Icon = Clock;
    friendlyStatus = 'Searching for Pro';
  } else if (['accepted', 'worker_arriving'].includes(activity.status)) {
    badgeColor = 'bg-orange-50 text-orange-700 border-orange-200';
    Icon = RotateCcw;
    friendlyStatus = 'On the way';
  } else if (['arrived', 'work_started', 'in_progress'].includes(activity.status)) {
    badgeColor = 'bg-indigo-50 text-indigo-700 border-indigo-200';
    Icon = Clock;
    friendlyStatus = 'In Progress';
  } else if (activity.status.includes('otp') || activity.status.includes('payment')) {
    badgeColor = 'bg-purple-50 text-purple-700 border-purple-200';
    Icon = CheckCircle2;
    friendlyStatus = 'Finishing up';
  }

  const isOngoing = !['completed', 'payment_verified', 'paid_completed', 'cancelled'].includes(activity.status);
  const isCancellable = ['pending', 'broadcasting', 'accepted'].includes(activity.status);

  return (
    <div className="bg-white mx-4 my-3 rounded-3xl border border-gray-100 shadow-sm overflow-hidden flex flex-col active:scale-[0.98] transition-transform">
      {/* Header Info */}
      <div 
        onClick={() => router.push(`/booking/${activity.id}`)}
        className="p-4 flex flex-col gap-3 cursor-pointer"
      >
        <div className="flex justify-between items-start">
          <div className="flex flex-col">
            <h3 className="font-black text-gray-900 text-lg leading-tight">{activity.service_name}</h3>
            <span className="text-xs font-bold text-gray-400 mt-0.5">{formattedDate}</span>
          </div>
          <span className="font-black text-gray-900 text-lg">
            ₹{activity.price}
          </span>
        </div>

        {/* Worker Info if assigned */}
        {activity.worker && (
          <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-2xl border border-gray-100 mt-1">
            <div className="w-10 h-10 rounded-full bg-gray-200 overflow-hidden border border-gray-300">
              {activity.worker.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={activity.worker.avatar_url} alt="Pro" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center font-bold text-gray-400 text-sm">
                  {activity.worker.name.charAt(0)}
                </div>
              )}
            </div>
            <div className="flex flex-col flex-1">
              <span className="text-sm font-bold text-gray-900">{activity.worker.name}</span>
              <div className="flex items-center gap-1 mt-0.5">
                <Star size={12} className="text-amber-500 fill-amber-500" />
                <span className="text-xs font-bold text-gray-600">{activity.worker.rating.toFixed(1)}</span>
              </div>
            </div>
            <ChevronRight size={20} className="text-gray-400" />
          </div>
        )}

        <div className="flex items-center gap-1 text-gray-500 mt-1">
          <MapPin size={12} />
          <span className="text-xs font-medium truncate">{activity.location || 'Location not specified'}</span>
        </div>
      </div>

      {/* Footer / Actions */}
      <div className="px-4 py-3 bg-gray-50/50 border-t border-gray-100 flex items-center justify-between">
        <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border ${badgeColor}`}>
          <Icon size={12} />
          <span className="text-xs font-bold">{friendlyStatus}</span>
        </div>

        <div className="flex items-center gap-2">
          {isCancellable && (
            <button
              onClick={() => onCancel(activity.id)}
              className="px-4 py-2 rounded-full border border-gray-200 bg-white text-gray-600 text-xs font-bold shadow-sm hover:bg-gray-50"
            >
              Cancel
            </button>
          )}

          {!isOngoing && (
            <button
              onClick={() => onRebook(activity.id)}
              className="px-4 py-2 rounded-full border border-blue-100 bg-blue-50 text-blue-700 text-xs font-bold shadow-sm hover:bg-blue-100"
            >
              Rebook
            </button>
          )}

          {isOngoing && (
            <button
              onClick={() => router.push(`/booking/${activity.id}`)}
              className="px-4 py-2 rounded-full bg-blue-600 text-white text-xs font-bold shadow-md shadow-blue-500/20 hover:bg-blue-700"
            >
              Track
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
