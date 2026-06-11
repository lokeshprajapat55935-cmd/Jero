"use client";

import React, { useEffect, useState } from 'react';
import { ActivityFilter } from '@/components/activity/ActivityFilter';
import { ActivityCard } from '@/components/activity/ActivityCard';
import { useActivity } from '@/hooks/useActivity';
import { createClient } from '@/lib/supabase/client';
import { ScrollText, WifiOff, AlertCircle } from 'lucide-react';
import { useRouter } from 'next/navigation';

export default function ActivityPage() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | undefined>();
  const {
    activities,
    filter,
    setFilter,
    isLoading,
    isOffline,
    error,
    cancelBooking,
    rebook
  } = useActivity(userId);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then((res: { data: any }) => {
      if (res.data?.user) setUserId(res.data.user.id);
    });
  }, []);

  const handleRebook = async (id: string) => {
    const newBookingId = await rebook(id);
    if (newBookingId) {
      router.push(`/booking/${newBookingId}`);
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-gray-50 pb-24">
      
      {/* Premium Header */}
      <div className="bg-white px-4 pt-safe pb-4 shadow-sm border-b border-gray-100 sticky top-0 z-30">
        <h1 className="text-2xl font-black text-gray-900 mt-2">Activity</h1>
      </div>

      <ActivityFilter currentFilter={filter} onFilterChange={setFilter} />

      <div className="flex-1 overflow-y-auto">
        
        {isOffline && (
          <div className="m-4 p-4 bg-orange-50 border border-orange-100 rounded-2xl flex items-center gap-3">
            <WifiOff className="text-orange-500" size={24} />
            <div className="flex flex-col">
              <span className="text-sm font-bold text-orange-900">You are offline</span>
              <span className="text-xs font-medium text-orange-700">Showing cached activity history.</span>
            </div>
          </div>
        )}

        {error && !isOffline && (
          <div className="m-4 p-4 bg-red-50 border border-red-100 rounded-2xl flex items-center gap-3">
            <AlertCircle className="text-red-500" size={24} />
            <div className="flex flex-col">
              <span className="text-sm font-bold text-red-900">Failed to load</span>
              <span className="text-xs font-medium text-red-700">{error}</span>
            </div>
          </div>
        )}

        {isLoading ? (
          <div className="animate-pulse space-y-4 pt-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="bg-white mx-4 h-40 rounded-3xl border border-gray-100"></div>
            ))}
          </div>
        ) : activities.length > 0 ? (
          <div className="pt-2 animate-in fade-in duration-300">
            {activities.map(activity => (
              <ActivityCard 
                key={activity.id} 
                activity={activity} 
                onCancel={cancelBooking}
                onRebook={handleRebook}
              />
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center pt-32 px-6 text-center animate-in fade-in zoom-in-95 duration-300">
            <div className="w-24 h-24 bg-blue-50 rounded-full flex items-center justify-center mb-6">
              <ScrollText size={40} className="text-blue-500" />
            </div>
            <h3 className="text-xl font-black text-gray-900 mb-2">No activity yet</h3>
            <p className="text-sm font-medium text-gray-500 max-w-[250px] mb-8">
              {filter === 'all' 
                ? "You haven't booked any services yet. When you do, they will appear here." 
                : `You have no ${filter} bookings at the moment.`}
            </p>
            {filter === 'all' && (
              <button 
                onClick={() => router.push('/dashboard')}
                className="px-8 py-4 bg-gray-900 text-white rounded-2xl font-bold active:scale-95 transition-transform"
              >
                Book a service
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
