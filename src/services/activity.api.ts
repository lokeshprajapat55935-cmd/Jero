export type ActivityFilterType = 'all' | 'ongoing' | 'completed' | 'cancelled';

export interface ActivityWorker {
  id: string;
  name: string;
  rating: number;
  avatar_url: string | null;
  phone: string | null;
}

export interface ActivityItem {
  id: string;
  service_name: string;
  status: string;
  price: number;
  created_at: string;
  scheduled_at: string;
  location: string;
  payment_method: string;
  payment_status: string;
  worker: ActivityWorker | null;
}

export const activityApi = {
  /**
   * Fetch paginated and filtered activities
   */
  async getActivities(filter: ActivityFilterType, limit: number = 50): Promise<ActivityItem[]> {
    const res = await fetch(`/api/customer/activity?filter=${filter}&limit=${limit}`);
    if (!res.ok) throw new Error('Failed to load activities');
    const json = await res.json();
    return json.data?.activities || [];
  },

  /**
   * Cancel an ongoing booking
   */
  async cancelBooking(bookingId: string): Promise<void> {
    const res = await fetch(`/api/booking/cancel/${bookingId}`, {
      method: 'PATCH',
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error?.message || 'Failed to cancel booking');
    }
  },

  /**
   * Rebook a previous service
   */
  async rebook(bookingId: string): Promise<{ booking_id: string }> {
    const res = await fetch(`/api/booking/rebook/${bookingId}`, {
      method: 'POST',
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error?.message || 'Failed to rebook');
    }
    const json = await res.json();
    return json.data;
  }
};
