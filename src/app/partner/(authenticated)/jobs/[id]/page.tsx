'use client';

import React from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, MapPin, User, Banknote, AlertCircle, CheckCircle2, Phone, Calendar, Star, MessageSquare, Loader2 } from 'lucide-react';
import { useBooking } from '@/hooks/useBooking';
import { BookingStatusActions } from '@/components/booking/BookingStatusActions';
import { OtpVerifyForm } from '@/components/booking/OtpVerifyForm';
import { Skeleton } from '@/components/ui/skeleton';
import { Booking } from '@/types';
import { reviewService } from '@/services/review';
import { toast } from 'react-hot-toast';

import { BookingMaterials } from '@/components/booking/BookingMaterials';

const WORKER_STEPS: Array<{
  label: string;
  action: string;
  nextStatus: Booking['status'];
  fromStatuses: Booking['status'][];
  color: string;
}> = [
  {
    label: "I'm On My Way",
    action: 'Mark En Route',
    nextStatus: 'worker_arriving',
    fromStatuses: ['accepted'],
    color: 'bg-indigo-600 hover:bg-indigo-700',
  },
  {
    label: 'Mark Arrived at Location',
    action: 'Mark Arrived',
    nextStatus: 'arrived',
    fromStatuses: ['worker_arriving'],
    color: 'bg-blue-600 hover:bg-blue-700',
  },
  {
    label: 'Start Work Now',
    action: 'Start Work',
    nextStatus: 'work_started',
    fromStatuses: ['arrived'],
    color: 'bg-amber-500 hover:bg-amber-600',
  },
  {
    label: 'Finish Job & Request OTP',
    action: 'Mark Work Complete',
    nextStatus: 'work_completed_pending_otp',
    fromStatuses: ['work_started', 'started', 'item_approved'],
    color: 'bg-teal-600 hover:bg-teal-700',
  },
];

export default function WorkerJobDetailPage() {
  const params = useParams();
  const router = useRouter();
  const bookingId = typeof params.id === 'string' ? params.id : null;

  const { booking, isLoading, isUpdating, error, updateStatus, verifyOtp } = useBooking(bookingId);

  const [hasWorkerReviewed, setHasWorkerReviewed] = React.useState(false);
  const [loadingReviews, setLoadingReviews] = React.useState(false);
  const [ratingBehavior, setRatingBehavior] = React.useState(5);
  const [ratingCooperation, setRatingCooperation] = React.useState(5);
  const [ratingPayment, setRatingPayment] = React.useState(5);
  const [workerComment, setWorkerComment] = React.useState('');
  const [submittingReview, setSubmittingReview] = React.useState(false);

  // Compute completion state safely for the hook dependency
  const isCompleted = booking ? (booking.status === 'completed' || booking.status === 'payment_verified') : false;

  React.useEffect(() => {
    if (isCompleted && bookingId) {
      setLoadingReviews(true);
      reviewService.getReviewsForBooking(bookingId)
        .then((res) => {
          if (res.data) {
            const workerRev = res.data.find((r) => r.reviewer_role === 'worker');
            if (workerRev) {
              setHasWorkerReviewed(true);
            }
          }
        })
        .catch((err) => console.error(err))
        .finally(() => setLoadingReviews(false));
    }
  }, [bookingId, isCompleted]);

  if (isLoading) {
    return (
      <div className="flex flex-col min-h-screen bg-gray-50">
        <div className="bg-white border-b px-4 py-4 flex items-center gap-3">
          <Skeleton className="w-10 h-10 rounded-full" />
          <Skeleton className="h-6 w-40" />
        </div>
        <div className="p-4 space-y-4">
          <Skeleton className="h-40 w-full rounded-2xl" />
          <Skeleton className="h-56 w-full rounded-2xl" />
        </div>
      </div>
    );
  }

  if (error || !booking) {
    return (
      <div className="flex flex-col min-h-screen bg-gray-50 items-center justify-center p-8 text-center">
        <AlertCircle className="w-12 h-12 text-red-400 mb-4" />
        <h2 className="text-xl font-bold text-gray-900 mb-2">Job Not Found</h2>
        <p className="text-gray-500 text-sm mb-6">{error ?? 'This job could not be loaded.'}</p>
        <button onClick={() => router.push('/worker/jobs')} className="text-blue-600 font-bold text-sm underline">
          Back to Jobs
        </button>
      </div>
    );
  }

  const clientProfile = (booking.client as any)?.profile;
  const showOtpForm = booking.status === 'otp_generated' || booking.status === 'work_completed_pending_otp';

  // Find the next available action for the worker
  const nextAction = WORKER_STEPS.find((s) => s.fromStatuses.includes(booking.status));

  return (
    <div className="flex flex-col min-h-screen bg-gray-50 pb-8">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-4 py-4 sticky top-0 z-20 flex items-center gap-3">
        <button onClick={() => router.back()} className="p-2 -ml-2 text-gray-500 hover:text-gray-900 rounded-full hover:bg-gray-100">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1">
          <h1 className="text-lg font-bold text-gray-900">{booking.category} Job</h1>
          <p className="text-xs text-gray-500 capitalize">{booking.status.replace(/_/g, ' ')}</p>
        </div>
      </div>

      <div className="max-w-2xl mx-auto w-full p-4 flex flex-col gap-4">

        {/* Completion Banner */}
        {isCompleted && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-5 flex items-center gap-3">
            <CheckCircle2 className="w-8 h-8 text-emerald-600 shrink-0" />
            <div>
              <p className="font-black text-emerald-900 text-lg">Job Complete!</p>
              <p className="text-sm text-emerald-700">Great work! Earnings will be reflected shortly.</p>
            </div>
          </div>
        )}

        {/* Worker Customer Rating Form */}
        {isCompleted && !loadingReviews && !hasWorkerReviewed && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4 animate-in fade-in slide-in-from-bottom-3 duration-300">
            <div>
              <h3 className="text-sm font-black text-gray-900 flex items-center gap-2">
                <Star className="w-4 h-4 text-amber-500 fill-amber-500" />
                Rate Customer Experience
              </h3>
              <p className="text-[11px] text-gray-500 mt-0.5 leading-relaxed">
                Provide feedback regarding your experience with this customer. Your ratings are anonymous and help support the Zolvo community.
              </p>
            </div>
            
            <form onSubmit={async (e) => {
              e.preventDefault();
              setSubmittingReview(true);
              try {
                const res = await reviewService.submitWorkerReview({
                  booking_id: booking.id,
                  rating_behavior: ratingBehavior,
                  rating_cooperation: ratingCooperation,
                  rating_payment: ratingPayment,
                  review_text: workerComment.trim() || undefined,
                });
                if (res.error) throw new Error(res.error);
                setHasWorkerReviewed(true);
                toast.success('Thank you for rating the customer!');
              } catch (err: any) {
                toast.error(err.message || 'Failed to submit rating');
              } finally {
                setSubmittingReview(false);
              }
            }} className="space-y-4">
              <div className="space-y-1 divide-y divide-gray-50">
                <StarSelector label="Customer Behavior" value={ratingBehavior} onChange={setRatingBehavior} />
                <StarSelector label="Cooperation & Communication" value={ratingCooperation} onChange={setRatingCooperation} />
                <StarSelector label="Payment / Tip Experience" value={ratingPayment} onChange={setRatingPayment} />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block">
                  Optional Comment
                </label>
                <div className="relative">
                  <textarea
                    value={workerComment}
                    onChange={(e) => setWorkerComment(e.target.value)}
                    placeholder="Describe your experience working with this client..."
                    maxLength={300}
                    rows={2}
                    className="w-full bg-gray-50 border border-gray-100 rounded-xl px-3 py-2 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all resize-none"
                  />
                  <MessageSquare className="absolute right-3 bottom-3 w-4 h-4 text-gray-400 pointer-events-none" />
                </div>
              </div>

              <button
                type="submit"
                disabled={submittingReview}
                className="w-full h-12 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm rounded-xl transition-all flex items-center justify-center gap-2 disabled:opacity-50 active:scale-[0.99]"
              >
                {submittingReview ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Submitting rating...
                  </>
                ) : (
                  'Submit Rating'
                )}
              </button>
            </form>
          </div>
        )}

        {/* Job Details */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-black text-gray-900 text-lg">{booking.category}</h2>
            <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-100">
              ₹{(booking.service_charge ?? booking.total_price ?? 0).toLocaleString('en-IN')}
            </span>
          </div>

          <p className="text-sm text-gray-600 mb-4 bg-gray-50 p-3 rounded-xl">{booking.description}</p>

          <div className="flex flex-col gap-3 text-sm">
            <div className="flex items-start gap-2 text-gray-600">
              <MapPin className="w-4.5 h-4.5 text-gray-400 mt-0.5 shrink-0" />
              <div className="flex-1">
                <span className="font-medium block">{booking.location_address ?? 'Not specified'}</span>
                {booking.location_address && (
                  <a
                    href={
                      booking.latitude && booking.longitude
                        ? `https://www.google.com/maps/search/?api=1&query=${booking.latitude},${booking.longitude}`
                        : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(booking.location_address)}`
                    }
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-indigo-600 hover:text-indigo-700 font-bold mt-1 inline-flex items-center gap-1 transition-colors"
                  >
                    🗺️ Open in Google Maps
                  </a>
                )}
              </div>
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
              <span className="font-medium capitalize">Payment Method: <span className="font-bold text-gray-950">{booking.payment_method}</span></span>
            </div>
          </div>

          {/* Attached Images */}
          {booking.image_urls && booking.image_urls.length > 0 && (
            <div className="mt-5 pt-4 border-t border-gray-100">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2.5">Customer Attached Photos</p>
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

        {/* Materials & Item Approval Flow */}
        {['work_started', 'started', 'work_completed', 'awaiting_item_approval', 'item_approved', 'work_completed_pending_otp', 'otp_generated', 'otp_verified', 'awaiting_payment', 'payment_processing', 'payment_verified', 'completed'].includes(booking.status) && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-5">
            <BookingMaterials
              bookingId={booking.id}
              readOnly={['item_approved', 'work_completed_pending_otp', 'otp_generated', 'otp_verified', 'awaiting_payment', 'payment_processing', 'payment_verified', 'completed'].includes(booking.status)}
            />

            {['work_started', 'started', 'work_completed'].includes(booking.status) && (
              <div className="flex flex-col gap-2 pt-2 border-t border-gray-50">
                <button
                  onClick={() => updateStatus('awaiting_item_approval', 'Materials added, awaiting customer approval')}
                  disabled={isUpdating}
                  className="w-full h-12 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm rounded-xl transition-all disabled:opacity-50"
                >
                  {isUpdating ? 'Updating...' : 'Submit Items for Client Approval'}
                </button>
                <button
                  onClick={() => updateStatus('work_completed_pending_otp', 'No materials used, requesting completion OTP')}
                  disabled={isUpdating}
                  className="w-full h-10 text-gray-500 hover:text-gray-700 font-bold text-xs underline transition-all disabled:opacity-50"
                >
                  {isUpdating ? 'Updating...' : 'No Materials? Skip to OTP →'}
                </button>
              </div>
            )}

            {booking.status === 'awaiting_item_approval' && (
              <div className="bg-amber-50 border border-amber-100 rounded-xl p-4 flex items-center gap-3">
                <Loader2 className="w-5 h-5 text-amber-600 animate-spin shrink-0" />
                <p className="text-xs font-bold text-amber-800">
                  Waiting for customer to approve material charges...
                </p>
              </div>
            )}

            {booking.status === 'item_approved' && (
              <div className="space-y-3 pt-2 border-t border-gray-50">
                <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-4 flex items-center gap-3">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                  <p className="text-xs font-bold text-emerald-800">
                    Materials approved! You can now request the completion OTP.
                  </p>
                </div>
                <button
                  onClick={() => updateStatus('work_completed_pending_otp', 'Items approved, generating OTP')}
                  disabled={isUpdating}
                  className="w-full h-12 bg-teal-600 hover:bg-teal-700 text-white font-bold text-sm rounded-xl transition-all disabled:opacity-50"
                >
                  {isUpdating ? 'Generating...' : 'Finish Job & Request OTP'}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Client Info */}
        {clientProfile && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Customer</p>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-full bg-blue-50 border border-blue-100 flex items-center justify-center">
                  <User className="w-5 h-5 text-blue-400" />
                </div>
                <div>
                  <p className="font-bold text-gray-900">{clientProfile.full_name ?? 'Customer'}</p>
                  <p className="text-xs text-gray-500">{clientProfile.phone ?? 'No phone'}</p>
                </div>
              </div>
              {clientProfile.phone && (
                <a
                  href={`tel:${clientProfile.phone}`}
                  className="flex items-center gap-1.5 bg-emerald-50 text-emerald-700 px-3 py-2 rounded-xl text-xs font-bold border border-emerald-100"
                >
                  <Phone className="w-3.5 h-3.5" />
                  Call
                </a>
              )}
            </div>
          </div>
        )}

        {/* Action Buttons */}
        {!isCompleted && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-4">Your Next Action</p>

            {nextAction ? (
              <button
                onClick={() => updateStatus(nextAction.nextStatus, `${nextAction.action} by worker`)}
                disabled={isUpdating}
                className={`w-full h-14 text-white font-bold text-base rounded-xl transition-colors disabled:opacity-50 ${nextAction.color}`}
              >
                {isUpdating ? 'Updating...' : nextAction.label}
              </button>
            ) : showOtpForm ? null : (
              <p className="text-sm text-gray-400 text-center py-4">Waiting for the next step...</p>
            )}
          </div>
        )}

        {/* OTP Entry Form (shown when worker needs to enter customer's OTP) */}
        {showOtpForm && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Verification Required</p>
            <OtpVerifyForm
              onVerify={async (otp) => { await verifyOtp(otp); }}
              isLoading={isUpdating}
            />
            {booking.status === 'work_completed_pending_otp' && (
              <button
                onClick={() => updateStatus('work_completed_pending_otp', 'OTP regenerated by worker')}
                disabled={isUpdating}
                className="w-full text-center text-sm font-bold text-indigo-600 hover:text-indigo-700 underline py-2 transition-colors disabled:opacity-50"
              >
                {isUpdating ? 'Regenerating...' : '🔄 Resend / Regenerate OTP'}
              </button>
            )}
          </div>
        )}

      </div>
    </div>
  );
}

function StarSelector({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  const [hoverVal, setHoverVal] = React.useState<number | null>(null);
  return (
    <div className="flex items-center justify-between py-2 border-b border-gray-50">
      <span className="text-xs font-bold text-gray-700">{label}</span>
      <div className="flex items-center gap-1">
        {[1, 2, 3, 4, 5].map((star) => {
          const active = hoverVal !== null ? star <= hoverVal : star <= value;
          return (
            <button
              key={star}
              type="button"
              onClick={() => onChange(star)}
              onMouseEnter={() => setHoverVal(star)}
              onMouseLeave={() => setHoverVal(null)}
              className="p-0.5 transition-transform hover:scale-125"
            >
              <Star
                size={18}
                className={active ? 'fill-amber-400 text-amber-400' : 'text-gray-200'}
              />
            </button>
          );
        })}
      </div>
    </div>
  );
}
