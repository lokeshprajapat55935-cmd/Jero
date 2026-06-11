import { Booking, BookingTimeline } from '@/types';
import { createClient } from '@/lib/supabase/client';
import type { BookingType } from '@/lib/booking/constants';

type ApiResult<T> = { success: boolean; data?: T; error?: string; details?: unknown };

async function parseApi<T>(response: Response): Promise<T> {
  const payload = (await response.json()) as ApiResult<T>;
  if (!response.ok || !payload.success) {
    throw new Error(payload.error || 'Request failed');
  }
  return payload.data as T;
}

export interface CreateBookingInput {
  category: string;
  description: string;
  location_address: string;
  latitude?: number | null;
  longitude?: number | null;
  area_id?: string | null;
  payment_method?: 'cash' | 'upi' | 'card';
  // Booking type
  booking_type?: BookingType;
  scheduled_for?: string | null;       // ISO datetime for scheduled bookings
  scheduled_date?: string | null;      // YYYY-MM-DD
  scheduled_time_slot?: 'asap' | 'morning' | 'afternoon' | 'evening' | 'custom';
  // Media
  image_urls?: string[];
  job_notes?: string;
}

export const bookingService = {
  async createBooking(input: CreateBookingInput) {
    const response = await fetch('/api/bookings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    return parseApi<Booking>(response);
  },

  async updateStatus(
    id: string,
    status: Booking['status'],
    reason?: string,
    payment_status?: 'pending' | 'paid'
  ) {
    const response = await fetch(`/api/bookings?id=${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, reason, payment_status }),
    });
    return parseApi<Booking>(response);
  },

  async getBooking(id: string) {
    const response = await fetch(`/api/bookings?id=${encodeURIComponent(id)}`);
    return parseApi<Booking>(response);
  },

  async getMyBookings(role: 'worker' | 'client') {
    const response = await fetch(`/api/bookings?role=${role}`);
    const data = await parseApi<{ bookings: Booking[] }>(response);
    return { data: data.bookings, error: null };
  },

  async acceptBooking(bookingId: string) {
    const response = await fetch('/api/bookings/accept', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ booking_id: bookingId }),
    });
    return parseApi<Booking>(response);
  },

  async verifyOtp(bookingId: string, otp: string) {
    const response = await fetch('/api/bookings/verify-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ booking_id: bookingId, otp }),
    });
    return parseApi<Booking>(response);
  },

  async verifyPayment(input: {
    booking_id: string;
    payment_method: 'cash' | 'upi' | 'card';
    payment_reference?: string;
    material_charge?: number;
  }) {
    const response = await fetch('/api/bookings/payment/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    return parseApi<Booking>(response);
  },

  /**
   * Upload a booking image and return the public URL.
   * Used before creating the booking to collect image_urls[].
   */
  async uploadImage(file: File): Promise<{ url: string; filePath: string }> {
    const formData = new FormData();
    formData.append('file', file);
    const response = await fetch('/api/bookings/upload-image', {
      method: 'POST',
      body: formData,
    });
    return parseApi<{ url: string; filePath: string }>(response);
  },

  /**
   * Submit a review for a completed booking.
   */
  async submitReview(input: { booking_id: string; rating: number; comment?: string }) {
    const response = await fetch('/api/bookings/review', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    return parseApi<{ review: unknown }>(response);
  },

  subscribeToBooking(id: string, onChange: (booking: Booking) => void) {
    const supabase = createClient();
    const channel = supabase
      .channel(`booking-realtime-${id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'bookings', filter: `id=eq.${id}` },
        (payload: any) => {
          bookingService.getBooking(id)
            .then((full) => onChange(full))
            .catch(() => onChange(payload.new as Booking));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }
};

export type { BookingTimeline };
