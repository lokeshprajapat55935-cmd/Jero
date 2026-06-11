'use client';

import React, { useState } from 'react';
import { Star, MessageSquare, Loader2, CheckCircle2, Award } from 'lucide-react';
import { reviewService } from '@/services/review';
import { Button } from '@/components/ui/button';
import toast from 'react-hot-toast';

interface BookingReviewCardProps {
  bookingId: string;
  onReviewSubmitted?: () => void;
}

const PREDEFINED_TAGS = [
  'Professional',
  'On Time',
  'Good Communication',
  'Quality Work',
  'Clean Service',
];

export function BookingReviewCard({ bookingId, onReviewSubmitted }: BookingReviewCardProps) {
  const [rating, setRating] = useState<number>(5);
  const [hoverRating, setHoverRating] = useState<number | null>(null);
  const [comment, setComment] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const res = await reviewService.submitCustomerReview({
        booking_id: bookingId,
        rating,
        review_text: comment.trim() || undefined,
        tags: selectedTags,
      });

      if (res.error) {
        throw new Error(res.error);
      }

      setIsSuccess(true);
      toast.success('Thank you for your review!');
      if (onReviewSubmitted) {
        onReviewSubmitted();
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to submit review');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isSuccess) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 text-center flex flex-col items-center justify-center animate-in fade-in zoom-in duration-300">
        <CheckCircle2 className="w-12 h-12 text-emerald-500 mb-3" />
        <h3 className="text-lg font-bold text-gray-900 mb-1">Feedback Submitted</h3>
        <p className="text-sm text-gray-500">
          Your review helps us maintain the highest quality of service.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-5">
      <div>
        <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
          <Award className="w-5 h-5 text-indigo-500" />
          Rate Your Experience
        </h3>
        <p className="text-xs text-gray-500 mt-1">
          How was your service? Share your feedback to help improve the platform.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Star Selection */}
        <div className="flex flex-col items-center gap-1.5 py-2">
          <div className="flex items-center gap-2">
            {[1, 2, 3, 4, 5].map((star) => {
              const isFilled = hoverRating !== null ? star <= hoverRating : star <= rating;
              return (
                <button
                  key={star}
                  type="button"
                  className="p-1 hover:scale-125 active:scale-95 transition-transform"
                  onClick={() => setRating(star)}
                  onMouseEnter={() => setHoverRating(star)}
                  onMouseLeave={() => setHoverRating(null)}
                >
                  <Star
                    className={`w-10 h-10 transition-all ${
                      isFilled ? 'fill-amber-400 text-amber-400 drop-shadow-sm' : 'text-gray-200'
                    }`}
                  />
                </button>
              );
            })}
          </div>
          <span className="text-xs font-bold text-amber-500 uppercase tracking-widest mt-1">
            {rating === 5 ? 'Excellent ⭐⭐⭐⭐⭐' : 
             rating === 4 ? 'Very Good ⭐⭐⭐⭐' : 
             rating === 3 ? 'Good ⭐⭐⭐' : 
             rating === 2 ? 'Fair ⭐⭐' : 'Poor ⭐'}
          </span>
        </div>

        {/* Selected Tags */}
        <div className="space-y-2">
          <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block">
            What went well?
          </label>
          <div className="flex flex-wrap gap-2">
            {PREDEFINED_TAGS.map((tag) => {
              const selected = selectedTags.includes(tag);
              return (
                <button
                  key={tag}
                  type="button"
                  onClick={() => toggleTag(tag)}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all border ${
                    selected
                      ? 'bg-indigo-50 border-indigo-200 text-indigo-700 font-bold scale-[1.02] shadow-sm'
                      : 'bg-gray-50 border-gray-100 hover:bg-gray-100/80 text-gray-600'
                  }`}
                >
                  {tag}
                </button>
              );
            })}
          </div>
        </div>

        {/* Text Area */}
        <div className="space-y-1.5">
          <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block">
            Review Comment (Optional)
          </label>
          <div className="relative">
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Tell us what you liked or how we can improve..."
              maxLength={500}
              rows={3}
              className="w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all resize-none"
            />
            <MessageSquare className="absolute right-4 bottom-4 w-4 h-4 text-gray-400 pointer-events-none" />
          </div>
          <div className="text-right text-[10px] text-gray-400 font-medium">
            {comment.length}/500 characters
          </div>
        </div>

        {/* Submit */}
        <Button
          type="submit"
          disabled={isSubmitting}
          className="w-full h-12 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl transition-all flex items-center justify-center gap-2 shadow-sm shadow-indigo-600/10 active:scale-[0.99]"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Submitting...
            </>
          ) : (
            'Submit Review'
          )}
        </Button>
      </form>
    </div>
  );
}
