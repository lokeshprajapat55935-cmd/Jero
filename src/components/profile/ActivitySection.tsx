import React, { useState, useEffect } from 'react';
import { ActivitySummary } from '@/services/profile.api';
import { CalendarCheck, ChevronRight, Clock, Star, X, Loader2, Award, ThumbsUp } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { useUser } from '@/providers/UserProvider';
import { reviewService } from '@/services/review';
import type { Review } from '@/types';

interface ActivitySectionProps {
  activity: ActivitySummary | null;
  isLoading: boolean;
}

export function ActivitySection({ activity, isLoading }: ActivitySectionProps) {
  const { profile } = useUser();
  const [isOpen, setIsOpen] = useState(false);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loadingReviews, setLoadingReviews] = useState(false);
  const [activeTab, setActiveTab] = useState<'left' | 'received'>('left'); // left = written by client, received = written by worker

  useEffect(() => {
    if (isOpen && profile?.id) {
      setLoadingReviews(true);
      reviewService.getCustomerReviews(profile.id)
        .then((res) => {
          if (res.data) {
            setReviews(res.data);
          }
        })
        .catch((err) => console.error(err))
        .finally(() => setLoadingReviews(false));
    }
  }, [isOpen, profile?.id]);

  if (isLoading) {
    return (
      <div className="bg-white p-4 mb-2 border-b border-gray-100">
        <Skeleton className="h-5 w-32 mb-4" />
        <div className="grid grid-cols-2 gap-4 mb-4">
          <Skeleton className="h-20 rounded-xl" />
          <Skeleton className="h-20 rounded-xl" />
        </div>
      </div>
    );
  }

  const active = activity?.active_bookings ?? 0;
  const completed = activity?.completed_bookings ?? 0;

  // Filter reviews
  const reviewsLeft = reviews.filter((r) => r.reviewer_role === 'client');
  const reviewsReceived = reviews.filter((r) => r.reviewer_role === 'worker');

  return (
    <div className="bg-white py-2 mb-2 border-b border-gray-100">
      <div className="px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">
        My Activity
      </div>

      <div className="px-4 py-2 grid grid-cols-2 gap-3">
        <div className="bg-blue-50/50 border border-blue-100/50 rounded-xl p-3 flex flex-col justify-between">
          <Clock className="w-5 h-5 text-blue-500 mb-2" />
          <div>
            <p className="text-xl font-bold text-gray-900">{active}</p>
            <p className="text-xs text-gray-600 font-medium">Active Bookings</p>
          </div>
        </div>
        <div className="bg-indigo-50/50 border border-indigo-100/50 rounded-xl p-3 flex flex-col justify-between">
          <CalendarCheck className="w-5 h-5 text-indigo-500 mb-2" />
          <div>
            <p className="text-xl font-bold text-gray-900">{completed}</p>
            <p className="text-xs text-gray-600 font-medium">Past Services</p>
          </div>
        </div>
      </div>

      <div className="flex flex-col mt-2">
        <div 
          onClick={() => setIsOpen(true)}
          className="flex items-center justify-between px-4 py-4 active:bg-gray-50 transition-colors cursor-pointer border-t border-gray-50"
        >
          <div className="flex items-center gap-3">
            <Star className="w-5 h-5 text-gray-400 shrink-0" />
            <span className="text-sm text-gray-900 font-medium">My Reviews</span>
          </div>
          <ChevronRight className="w-5 h-5 text-gray-300" />
        </div>
      </div>

      {/* Slide-over Drawer for Reviews */}
      {isOpen && (
        <div className="fixed inset-0 z-50 overflow-hidden flex items-end justify-center">
          {/* Overlay */}
          <div 
            onClick={() => setIsOpen(false)}
            className="absolute inset-0 bg-black/50 backdrop-blur-sm transition-opacity duration-300"
          />

          {/* Drawer Content */}
          <div className="relative bg-white w-full max-w-lg rounded-t-3xl shadow-xl flex flex-col max-h-[85vh] animate-in slide-in-from-bottom duration-300">
            {/* Header */}
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-gray-950 text-base">Reviews Ledger</h3>
                <p className="text-[11px] text-gray-500">Your feedback log and cooperation rating breakdown</p>
              </div>
              <button 
                onClick={() => setIsOpen(false)}
                className="p-1.5 hover:bg-gray-100 rounded-full text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {/* Tabs */}
            <div className="px-5 pt-3 flex gap-2 border-b border-gray-50">
              <button
                onClick={() => setActiveTab('left')}
                className={`pb-2.5 text-xs font-bold transition-all relative ${
                  activeTab === 'left' ? 'text-indigo-600' : 'text-gray-400 hover:text-gray-600'
                }`}
              >
                Feedback Left ({reviewsLeft.length})
                {activeTab === 'left' && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-600 rounded-full" />
                )}
              </button>
              <button
                onClick={() => setActiveTab('received')}
                className={`pb-2.5 text-xs font-bold transition-all relative ${
                  activeTab === 'received' ? 'text-indigo-600' : 'text-gray-400 hover:text-gray-600'
                }`}
              >
                Feedback Received ({reviewsReceived.length})
                {activeTab === 'received' && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-600 rounded-full" />
                )}
              </button>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {loadingReviews ? (
                <div className="flex flex-col items-center justify-center py-12 gap-2">
                  <Loader2 className="w-6 h-6 text-indigo-600 animate-spin" />
                  <p className="text-xs text-gray-400">Loading reviews...</p>
                </div>
              ) : activeTab === 'left' ? (
                reviewsLeft.length === 0 ? (
                  <div className="py-12 text-center text-gray-400">
                    <Star className="w-8 h-8 text-gray-200 mx-auto mb-2" />
                    <p className="text-xs font-bold">You haven&apos;t left any reviews yet.</p>
                  </div>
                ) : (
                  reviewsLeft.map((r) => (
                    <div key={r.id} className="border border-gray-100 rounded-2xl p-4 space-y-2 bg-gray-50/20">
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="text-xs font-bold text-gray-900">
                            {r.worker?.profile?.full_name || 'Worker'}
                          </p>
                          <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider">
                            {r.worker?.category || 'Professional'}
                          </p>
                        </div>
                        <div className="flex items-center gap-0.5 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-100">
                          <Star className="w-3 h-3 text-amber-500 fill-amber-500" />
                          <span className="text-[10px] font-black text-amber-700">{Number(r.rating).toFixed(1)}</span>
                        </div>
                      </div>

                      {r.tags && r.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {r.tags.map((t) => (
                            <span key={t} className="text-[9px] font-bold bg-white border border-gray-100 text-gray-500 px-2 py-0.5 rounded-full">
                              {t}
                            </span>
                          ))}
                        </div>
                      )}

                      {r.review_text && (
                        <p className="text-xs text-gray-600 bg-white border border-gray-50 p-2.5 rounded-xl leading-relaxed italic">
                          &quot;{r.review_text}&quot;
                        </p>
                      )}

                      <p className="text-[10px] text-gray-400 text-right font-medium">
                        {new Date(r.created_at).toLocaleDateString('en-IN', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric'
                        })}
                      </p>
                    </div>
                  ))
                )
              ) : reviewsReceived.length === 0 ? (
                <div className="py-12 text-center text-gray-400">
                  <ThumbsUp className="w-8 h-8 text-gray-200 mx-auto mb-2" />
                  <p className="text-xs font-bold">No partner feedback received yet.</p>
                </div>
              ) : (
                reviewsReceived.map((r) => (
                  <div key={r.id} className="border border-gray-100 rounded-2xl p-4 space-y-3 bg-gray-50/20">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="text-xs font-bold text-gray-900">
                          Feedback by Partner
                        </p>
                        <p className="text-[10px] text-gray-400 font-semibold">
                          Worker Rating Average
                        </p>
                      </div>
                      <div className="flex items-center gap-0.5 bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-100">
                        <Award className="w-3 h-3 text-indigo-500" />
                        <span className="text-[10px] font-black text-indigo-700">{Number(r.rating).toFixed(1)}</span>
                      </div>
                    </div>

                    <div className="space-y-1.5 bg-white border border-gray-50 rounded-xl p-2.5 text-xs text-gray-700">
                      <div className="flex justify-between">
                        <span className="text-gray-500 font-medium">Customer Behavior:</span>
                        <span className="font-bold text-gray-900">{'⭐'.repeat(r.rating_behavior ?? 5)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500 font-medium">Cooperation:</span>
                        <span className="font-bold text-gray-900">{'⭐'.repeat(r.rating_cooperation ?? 5)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500 font-medium">Payment Experience:</span>
                        <span className="font-bold text-gray-900">{'⭐'.repeat(r.rating_payment ?? 5)}</span>
                      </div>
                    </div>

                    {r.review_text && (
                      <p className="text-xs text-gray-600 bg-white border border-gray-50 p-2.5 rounded-xl leading-relaxed italic">
                        &quot;{r.review_text}&quot;
                      </p>
                    )}

                    <p className="text-[10px] text-gray-400 text-right font-medium">
                      {new Date(r.created_at).toLocaleDateString('en-IN', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric'
                      })}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
