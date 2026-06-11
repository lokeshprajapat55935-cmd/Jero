'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, RefreshCw, MapPin, User, Banknote, AlertCircle, CheckCircle2, Radar, Calendar, Phone, Truck, Star, Package } from 'lucide-react';
import { useBooking } from '@/hooks/useBooking';
import { useDispatchStatus } from '@/hooks/useDispatchStatus';
import { BookingStatusTracker } from '@/components/booking/BookingStatusTracker';
import { OtpDisplayCard } from '@/components/booking/OtpDisplayCard';
import { PaymentSheet } from '@/components/booking/PaymentSheet';
import { BookingReviewCard } from '@/components/booking/BookingReviewCard';
import { BookingMaterials } from '@/components/booking/BookingMaterials';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
import { toast } from 'react-hot-toast';

function calculateDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Radius of the earth in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export default function BookingDetailPage() {
  const params = useParams();
  const router = useRouter();
  const bookingId = typeof params.id === 'string' ? params.id : null;

  const { booking, isLoading, isUpdating, error, fetchBooking, updateStatus, verifyPayment } = useBooking(bookingId);
  const { dispatchData, isSearching, timeLeftSeconds } = useDispatchStatus(bookingId, booking?.status ?? null);
  const [completionOtp, setCompletionOtp] = useState<string | null>(null);

  useEffect(() => {
    if (!bookingId || booking?.status !== 'work_completed_pending_otp') {
      setCompletionOtp(null);
      return;
    }

    const supabase = createClient();
    
    const fetchOtpNotification = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', user.id)
        .eq('type', 'booking_otp_completion')
        .eq('metadata->>booking_id', bookingId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (data && data.metadata && data.metadata.otp_code) {
        setCompletionOtp(data.metadata.otp_code);
      }
    };

    fetchOtpNotification();

    const channel = supabase
      .channel('otp-notification-changes')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications' },
        (payload: any) => {
          if (
            payload.new &&
            payload.new.type === 'booking_otp_completion' &&
            payload.new.metadata &&
            payload.new.metadata.booking_id === bookingId
          ) {
            setCompletionOtp(payload.new.metadata.otp_code);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [booking?.status, bookingId]);

  if (isLoading) {
    return (
      <div className="flex flex-col min-h-screen bg-gray-100/60">
        <div className="bg-white border-b border-gray-100 px-4 py-4 flex items-center gap-3">
          <Skeleton className="w-10 h-10 rounded-full" />
          <Skeleton className="h-6 w-40" />
        </div>
        <div className="p-4 space-y-4">
          <Skeleton className="h-48 w-full rounded-2xl" />
          <Skeleton className="h-64 w-full rounded-2xl" />
        </div>
      </div>
    );
  }

  if (error || !booking) {
    return (
      <div className="flex flex-col min-h-screen bg-gray-100/60 items-center justify-center p-8 text-center">
        <AlertCircle className="w-12 h-12 text-red-400 mb-4" />
        <h2 className="text-xl font-bold text-gray-900 mb-2">Booking Not Found</h2>
        <p className="text-gray-500 text-sm mb-6">{error ?? 'This booking could not be loaded.'}</p>
        <Button onClick={() => router.push('/activity')} variant="outline">View All Bookings</Button>
      </div>
    );
  }

  const workerProfile = (booking.worker as any)?.profile;
  if (booking.status === 'work_completed_pending_otp' && completionOtp) {
    booking.otp_code = completionOtp;
  }
  const showOtp = (booking.status === 'otp_generated' && booking.otp_code) ||
                  (booking.status === 'work_completed_pending_otp' && completionOtp);
  const showPayment = booking.status === 'awaiting_payment' || booking.status === 'otp_verified';
  const isCompleted = booking.status === 'completed' || booking.status === 'payment_verified';

  const customerLat = booking.latitude;
  const customerLng = booking.longitude;
  const workerLat = (booking.worker as any)?.location?.latitude;
  const workerLng = (booking.worker as any)?.location?.longitude;

  let etaText = '';
  if (
    customerLat !== null && customerLat !== undefined &&
    customerLng !== null && customerLng !== undefined &&
    workerLat !== null && workerLat !== undefined &&
    workerLng !== null && workerLng !== undefined
  ) {
    const distanceKm = calculateDistanceKm(
      Number(customerLat),
      Number(customerLng),
      Number(workerLat),
      Number(workerLng)
    );
    const etaMinutes = Math.round(distanceKm * 5);
    etaText = `Worker will arrive in approximately ${etaMinutes} minutes`;
  }

  const handlePayment = async (method: 'cash' | 'upi' | 'card', ref?: string) => {
    await verifyPayment(method, ref);
  };

  const handleCancel = async () => {
    await updateStatus('cancelled', 'Cancelled by customer');
  };

  return (
    <div className="flex flex-col min-h-screen bg-gray-100/60 pb-8">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-4 py-4 sticky top-0 z-20 flex items-center gap-3">
        <button onClick={() => router.back()} className="p-2 -ml-2 text-gray-500 hover:text-gray-900 rounded-full hover:bg-gray-100 transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1">
          <h1 className="text-lg font-bold text-gray-900">{booking.category} Booking</h1>
          <p className="text-xs text-gray-500 capitalize">{booking.status.replace(/_/g, ' ')}</p>
        </div>
        <button onClick={() => fetchBooking()} className="p-2 text-gray-400 hover:text-gray-700 rounded-full hover:bg-gray-100 transition-colors">
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      <div className="max-w-2xl mx-auto w-full p-4 flex flex-col gap-4">

        {/* Completion Banner */}
        {isCompleted && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-5 flex items-center gap-3">
            <CheckCircle2 className="w-8 h-8 text-emerald-600 shrink-0" />
            <div>
              <p className="font-black text-emerald-900 text-lg">Booking Complete!</p>
              <p className="text-sm text-emerald-700">Thank you for using Zolvo. We hope you loved the service.</p>
            </div>
          </div>
        )}

        {/* Booking Info Card */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-black text-gray-900 text-lg">{booking.category}</h2>
            <span className="text-xs font-bold text-blue-600 bg-blue-50 px-2.5 py-1 rounded-full border border-blue-100 uppercase tracking-widest">
              {booking.payment_method}
            </span>
          </div>

          <p className="text-sm text-gray-600 mb-4 bg-gray-50 p-3 rounded-xl">{booking.description}</p>

          <div className="flex flex-col gap-2.5 text-sm">
            <div className="flex items-start gap-2 text-gray-600">
              <MapPin className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" />
              <span className="font-medium">{booking.location_address}</span>
            </div>
            
            {booking.booking_type === 'scheduled' && booking.scheduled_for && (
              <div className="flex items-center gap-2 text-gray-600">
                <Calendar className="w-4 h-4 text-gray-400 shrink-0" />
                <span className="font-medium">
                  Scheduled for:{' '}
                  <span className="font-bold text-gray-900">
                    {new Date(booking.scheduled_for).toLocaleDateString('en-IN', {
                      weekday: 'short',
                      day: 'numeric',
                      month: 'short',
                    })}{' '}
                    at{' '}
                    {new Date(booking.scheduled_for).toLocaleTimeString('en-IN', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </span>
              </div>
            )}

            <div className="flex items-center gap-2 text-gray-600">
              <Banknote className="w-4 h-4 text-gray-400 shrink-0" />
              <span className="font-bold text-gray-900">
                ₹{(booking.service_charge ?? booking.total_price ?? 0).toLocaleString('en-IN')}
              </span>
            </div>
          </div>

          {/* Attached Images */}
          {booking.image_urls && booking.image_urls.length > 0 && (
            <div className="mt-5 pt-4 border-t border-gray-100">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2.5">Job Photos</p>
              <div className="flex gap-3 overflow-x-auto pb-1">
                {booking.image_urls.map((url, idx) => (
                  <a
                    key={idx}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0 relative w-20 h-20 rounded-xl overflow-hidden border border-gray-100 hover:opacity-90 transition-opacity"
                  >
                    <img src={url} alt={`Job Photo ${idx + 1}`} className="w-full h-full object-cover" />
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Dispatching Radar State */}
        {isSearching && (
          <div className="bg-white rounded-2xl border-2 border-indigo-100 shadow-sm p-6 flex flex-col items-center text-center relative overflow-hidden">
            <div className="absolute inset-0 bg-indigo-50/10 -z-10 animate-pulse" />
            
            {/* Animated Radar */}
            <div className="relative w-32 h-32 flex items-center justify-center mb-5 mt-2">
              <div className="absolute inset-0 rounded-full border-2 border-indigo-200 opacity-20 animate-ping" />
              <div className="absolute w-20 h-20 rounded-full border-2 border-indigo-300 opacity-40 animate-ping [animation-delay:0.5s]" />
              <div className="absolute w-12 h-12 rounded-full bg-indigo-100 border border-indigo-200 flex items-center justify-center">
                <Radar className="w-6 h-6 text-indigo-600 animate-spin [animation-duration:6s]" />
              </div>
            </div>

            <h3 className="text-lg font-black text-gray-900 mb-1">Looking for Nearby {booking.category}s</h3>
            <p className="text-xs text-gray-500 max-w-sm mb-5">
              Your request is being broadcasted to all available professionals in your city. The first worker to accept locks the job.
            </p>

            {/* Radius and Notified Workers Stats */}
            <div className="grid grid-cols-2 gap-4 w-full bg-gray-50 p-4 rounded-xl border border-gray-100 text-left mb-4">
              <div>
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-0.5">Search Area</p>
                <p className="text-sm font-black text-indigo-600">
                  {dispatchData?.dispatch?.current_radius_km ?? '5.0'} km Radius
                </p>
                <p className="text-[9px] text-gray-400">Expanding to {dispatchData?.dispatch?.max_radius_km ?? '15.0'} km</p>
              </div>
              <div>
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-0.5">Workers Notified</p>
                <p className="text-sm font-black text-gray-800">
                  {booking.notified_worker_count ?? 0} professionals
                </p>
                <p className="text-[9px] text-gray-400">Broadcasting live</p>
              </div>
            </div>

            {/* Countdown timer */}
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-indigo-600 animate-pulse" />
              <span className="text-xs font-bold text-gray-600">
                Time Remaining:{' '}
                {timeLeftSeconds !== null ? (
                  <span className="font-mono text-indigo-600 font-extrabold text-sm">
                    {Math.floor(timeLeftSeconds / 60).toString().padStart(2, '0')}:
                    {(timeLeftSeconds % 60).toString().padStart(2, '0')}
                  </span>
                ) : (
                  <span className="text-gray-400 font-medium">Connecting...</span>
                )}
              </span>
            </div>
          </div>
        )}

        {/* Worker Info */}
        {booking.worker_id && workerProfile && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Assigned Worker</p>
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-indigo-50 border border-indigo-100 flex items-center justify-center">
                  {workerProfile.avatar_url ? (
                    <img src={workerProfile.avatar_url} alt="" className="w-full h-full rounded-full object-cover" />
                  ) : (
                    <User className="w-6 h-6 text-indigo-500" />
                  )}
                </div>
                <div>
                  <p className="font-bold text-gray-900">{workerProfile.full_name ?? 'Professional'}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded uppercase tracking-wider">
                      {booking.worker?.category || booking.category}
                    </span>
                    {booking.worker?.rating_avg !== undefined && booking.worker?.rating_avg !== null && (
                      <span className="text-xs text-amber-500 flex items-center gap-0.5 font-bold">
                        <Star className="w-3.5 h-3.5 fill-amber-500 text-amber-500 shrink-0" />
                        {Number(booking.worker.rating_avg).toFixed(1)}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-500 mt-1">{workerProfile.phone ?? 'Contact via chat'}</p>
                </div>
              </div>
              {workerProfile.phone && (
                <a
                  href={`tel:${workerProfile.phone}`}
                  className="bg-indigo-50 hover:bg-indigo-100 text-indigo-600 px-4 py-2.5 rounded-xl text-sm font-bold transition-colors shrink-0 flex items-center gap-1.5"
                >
                  <Phone className="w-4 h-4" />
                  Call Worker
                </a>
              )}
            </div>
            {etaText && ['accepted', 'worker_arriving', 'en_route'].includes(booking.status) && (
              <div className="mt-4 pt-3 border-t border-gray-100 text-sm text-gray-600 flex items-center gap-2">
                <Truck className="w-4 h-4 text-indigo-500 shrink-0" />
                <span className="font-medium">{etaText}</span>
              </div>
            )}
          </div>
        )}

        {/* No Worker Available Custom Card */}
        {booking.status === 'no_worker_available' && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 text-center space-y-4">
            <AlertCircle className="w-12 h-12 text-amber-500 mx-auto" />
            <div>
              <h3 className="text-lg font-black text-amber-900">No worker accepted your request</h3>
              <p className="text-sm text-amber-700 mt-1">
                We couldn&apos;t find a professional for your booking at this time. You can try resending the request.
              </p>
            </div>
            <Button
              onClick={async () => {
                await updateStatus('broadcasting', 'Resent booking request');
                fetchBooking();
              }}
              disabled={isUpdating}
              className="w-full h-12 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl flex items-center justify-center gap-2"
            >
              <RefreshCw className={cn("w-4 h-4", isUpdating && "animate-spin")} />
              {isUpdating ? 'Resending...' : 'Resend Request'}
            </Button>
          </div>
        )}

          {/* Item Approval */}

        {booking.status === 'awaiting_item_approval' && (
          <div className="bg-white rounded-2xl border-2 border-amber-100 shadow-sm p-5 space-y-4">
            <div className="flex items-center gap-3 mb-2">
              <Package className="w-6 h-6 text-amber-500" />
              <div>
                <h3 className="text-lg font-black text-gray-900">Approve Material Charges</h3>
                <p className="text-xs text-gray-500">The worker has added materials/extras. Please review and approve to proceed.</p>
              </div>
            </div>
            
            <BookingMaterials bookingId={booking.id} readOnly={true} />

            <div className="pt-4 border-t border-gray-100">
              <Button
                onClick={async () => {
                  try {
                    const res = await fetch('/api/bookings/items', {
                      method: 'PUT',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ booking_id: booking.id }),
                    });
                    const data = await res.json();
                    if (data.success) {
                      toast.success('Materials approved!');
                      fetchBooking();
                    } else {
                      toast.error(data.error || 'Approval failed');
                    }
                  } catch (err) {
                    toast.error('Failed to approve materials');
                  }
                }}
                disabled={isUpdating}
                className="w-full h-12 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl"
              >
                {isUpdating ? 'Approving...' : 'Approve & Proceed ✓'}
              </Button>
            </div>
          </div>
        )}

        {/* Status Tracker */}
        {!isCompleted && booking.status !== 'no_worker_available' && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-4">Booking Status</p>
            <BookingStatusTracker booking={booking} />
          </div>
        )}

        {/* OTP Display (customer sees this when worker requests OTP) */}
        {showOtp && <OtpDisplayCard booking={booking} />}

        {/* Confirm Completion Button (Direct Client Bypass) */}
        {booking.status === 'work_completed_pending_otp' && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-3">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Satisfied with the work?</p>
            <p className="text-xs text-gray-500 leading-relaxed">
              If the professional has completed the work to your satisfaction, you can confirm it directly here to complete the booking.
            </p>
            <Button
              onClick={async () => {
                if (confirm('Are you sure you want to confirm completion of this job?')) {
                  await updateStatus('completed', 'Directly confirmed by customer in app');
                }
              }}
              disabled={isUpdating}
              className="w-full h-12 bg-green-600 hover:bg-green-700 text-white font-bold rounded-xl"
            >
              {isUpdating ? 'Confirming...' : 'Confirm Job Completion ✓'}
            </Button>
          </div>
        )}

        {/* Payment Sheet */}
        {showPayment && (
          <PaymentSheet
            booking={booking}
            onConfirmPayment={handlePayment}
            isLoading={isUpdating}
          />
        )}

        {/* Review Card */}
        {isCompleted && (
          <BookingReviewCard bookingId={booking.id} />
        )}

        {/* Cancel Button */}
        {(booking.status === 'broadcasting' || booking.status === 'pending' || booking.status === 'scheduled' || booking.status === 'no_worker_available') && (
          <Button
            onClick={handleCancel}
            disabled={isUpdating}
            variant="outline"
            className="w-full h-12 border-red-200 text-red-600 hover:bg-red-50 hover:border-red-300 font-bold"
          >
            Cancel Booking
          </Button>
        )}

      </div>
    </div>
  );
}
