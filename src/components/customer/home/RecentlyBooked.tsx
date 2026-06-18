"use client";

import React from 'react';
import { useRouter } from 'next/navigation';
import { Calendar, Star, CheckCircle, ArrowRight } from 'lucide-react';
import type { Booking } from '@/types';

interface RecentlyBookedProps {
  bookings: Booking[];
}

export function RecentlyBooked({ bookings }: RecentlyBookedProps) {
  const router = useRouter();

  // Filter out invalid bookings and keep only completed ones
  const completedBookings = bookings
    .filter(b => b.status === 'completed' || b.status === 'paid_completed' || b.status === 'work_completed')
    .slice(0, 5); // Limit to top 5 recent bookings

  if (completedBookings.length === 0) return null;

  const handleBookAgain = (booking: Booking) => {
    const category = booking.category || 'electrician';
    router.push(`/booking/new?category=${category.toLowerCase()}`);
  };

  return (
    <div className="py-4">
      <div className="px-4 flex items-center justify-between mb-4">
        <h2 className="text-lg font-black text-gray-900">Recently Booked</h2>
      </div>

      <div className="flex overflow-x-auto no-scrollbar px-4 pb-4 gap-4 snap-x">
        {completedBookings.map((booking) => {
          // Format date cleanly
          const bookingDate = booking.scheduled_at 
            ? new Date(booking.scheduled_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
            : 'Recent';

          // Extract worker details safely
          const workerName = booking.worker?.profile?.full_name || booking.workerName || 'Professional';
          const avatarUrl = booking.worker?.profile?.avatar_url || null;
          const experience = booking.worker?.experience_years 
            ? `${booking.worker.experience_years} yrs exp` 
            : 'Verified Pro';
          const rating = booking.worker?.rating_avg 
            ? booking.worker.rating_avg.toFixed(1) 
            : '4.8';
          const city = booking.worker?.profile?.location_name || 'Bhilwara';
          const category = booking.category || 'Service';

          return (
            <div 
              key={booking.id}
              className="flex-shrink-0 w-[280px] bg-white border border-gray-100 rounded-[24px] p-4 shadow-sm snap-start flex flex-col justify-between"
            >
              <div>
                {/* Header: Service Category & Date */}
                <div className="flex justify-between items-center mb-3">
                  <span className="text-[10px] font-bold uppercase tracking-wider bg-gray-50 text-gray-500 px-2.5 py-1 rounded-lg border border-gray-100/50">
                    {category}
                  </span>
                  <div className="flex items-center gap-1 text-[10px] font-bold text-gray-400">
                    <Calendar size={10} />
                    <span>{bookingDate}</span>
                  </div>
                </div>

                {/* Worker Details (Respecting Privacy Constraints) */}
                <div className="flex gap-3 mb-4">
                  <div className="relative flex-shrink-0">
                    <div className="w-12 h-12 rounded-full bg-gray-50 overflow-hidden border border-gray-100 flex items-center justify-center">
                      {avatarUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={avatarUrl} alt={workerName} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-indigo-50 text-indigo-600 font-bold text-lg">
                          {workerName.charAt(0)}
                        </div>
                      )}
                    </div>
                    <div className="absolute -bottom-0.5 -right-0.5 bg-emerald-500 rounded-full p-0.5 border border-white">
                      <CheckCircle size={10} className="text-white fill-emerald-500" />
                    </div>
                  </div>

                  <div className="flex flex-col justify-center overflow-hidden">
                    <h4 className="font-extrabold text-gray-900 text-sm truncate flex items-center gap-1">
                      {workerName}
                    </h4>
                    
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[10px] font-bold text-gray-500">{experience}</span>
                      <span className="w-1 h-1 rounded-full bg-gray-300" />
                      <span className="text-[10px] font-bold text-gray-500 truncate max-w-[80px]">{city}</span>
                    </div>

                    <div className="flex items-center gap-1 mt-1">
                      <Star size={11} className="text-amber-500 fill-amber-500" />
                      <span className="text-xs font-black text-gray-700">{rating}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Action Button */}
              <button
                onClick={() => handleBookAgain(booking)}
                className="w-full h-11 rounded-xl bg-gray-50 hover:bg-black hover:text-white text-gray-800 text-xs font-bold transition-all flex items-center justify-center gap-1 border border-gray-100/80 active:scale-[0.98]"
              >
                <span>Book Again</span>
                <ArrowRight size={12} />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
