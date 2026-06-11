import type { Review } from '@/types';

export const reviewService = {
  /**
   * Submit a customer review (rating the worker)
   */
  async submitCustomerReview(input: {
    booking_id: string;
    rating: number;
    review_text?: string;
    tags?: string[];
  }): Promise<{ data: { review: Review } | null; error: string | null }> {
    try {
      const response = await fetch('/api/bookings/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      const json = await response.json();
      if (!response.ok || !json.success) {
        return { data: null, error: json.error || 'Failed to submit review' };
      }
      return { data: json.data, error: null };
    } catch (err: any) {
      return { data: null, error: err.message || 'Network error' };
    }
  },

  /**
   * Submit a worker review (rating the customer)
   */
  async submitWorkerReview(input: {
    booking_id: string;
    rating_behavior: number;
    rating_cooperation: number;
    rating_payment: number;
    review_text?: string;
  }): Promise<{ data: { review: Review } | null; error: string | null }> {
    try {
      const response = await fetch('/api/bookings/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      const json = await response.json();
      if (!response.ok || !json.success) {
        return { data: null, error: json.error || 'Failed to submit review' };
      }
      return { data: json.data, error: null };
    } catch (err: any) {
      return { data: null, error: err.message || 'Network error' };
    }
  },

  /**
   * Get reviews for a specific worker (client reviews)
   */
  async getWorkerReviews(workerId: string): Promise<{ data: Review[] | null; error: string | null }> {
    try {
      const response = await fetch(`/api/bookings/review?worker_id=${workerId}`);
      const json = await response.json();
      if (!response.ok || !json.success) {
        return { data: null, error: json.error || 'Failed to fetch worker reviews' };
      }
      return { data: json.data?.reviews || [], error: null };
    } catch (err: any) {
      return { data: null, error: err.message || 'Network error' };
    }
  },

  /**
   * Get reviews for a specific customer (reviews received or written)
   */
  async getCustomerReviews(customerId: string): Promise<{ data: Review[] | null; error: string | null }> {
    try {
      const response = await fetch(`/api/bookings/review?customer_id=${customerId}`);
      const json = await response.json();
      if (!response.ok || !json.success) {
        return { data: null, error: json.error || 'Failed to fetch customer reviews' };
      }
      return { data: json.data?.reviews || [], error: null };
    } catch (err: any) {
      return { data: null, error: err.message || 'Network error' };
    }
  },

  /**
   * Get reviews (both roles) associated with a single booking
   */
  async getReviewsForBooking(bookingId: string): Promise<{ data: Review[] | null; error: string | null }> {
    try {
      const response = await fetch(`/api/bookings/review?booking_id=${bookingId}`);
      const json = await response.json();
      if (!response.ok || !json.success) {
        return { data: null, error: json.error || 'Failed to fetch reviews for booking' };
      }
      return { data: json.data?.reviews || [], error: null };
    } catch (err: any) {
      return { data: null, error: err.message || 'Network error' };
    }
  },

  /**
   * ADMIN: Fetch all reviews
   */
  async getAllReviewsAdmin(filters?: {
    is_flagged?: boolean;
    is_hidden?: boolean;
    search?: string;
  }): Promise<{ data: Review[] | null; error: string | null }> {
    try {
      const params = new URLSearchParams();
      if (filters?.is_flagged !== undefined) params.append('is_flagged', String(filters.is_flagged));
      if (filters?.is_hidden !== undefined) params.append('is_hidden', String(filters.is_hidden));
      if (filters?.search) params.append('search', filters.search);

      const response = await fetch(`/api/admin/reviews?${params.toString()}`);
      const json = await response.json();
      if (!response.ok || !json.success) {
        return { data: null, error: json.error || 'Failed to fetch admin reviews' };
      }
      return { data: json.data?.reviews || [], error: null };
    } catch (err: any) {
      return { data: null, error: err.message || 'Network error' };
    }
  },

  /**
   * ADMIN: Moderate a review
   */
  async moderateReviewAdmin(
    reviewId: string,
    action: 'hide' | 'unhide' | 'flag' | 'unflag',
    reason?: string
  ): Promise<{ data: Review | null; error: string | null }> {
    try {
      const response = await fetch('/api/admin/reviews', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ review_id: reviewId, action, reason }),
      });
      const json = await response.json();
      if (!response.ok || !json.success) {
        return { data: null, error: json.error || 'Failed to moderate review' };
      }
      return { data: json.data?.review || null, error: null };
    } catch (err: any) {
      return { data: null, error: err.message || 'Network error' };
    }
  }
};
