/**
 * dispatch.service.ts
 *
 * Client-side service wrapper for the real-time dispatch system.
 * All methods are safe — never throw to the UI, always return { data, error }.
 */

import { Booking } from '@/types';

export interface IncomingJobRequest extends Pick<
  Booking,
  'id' | 'category' | 'description' | 'location_address' |
  'latitude' | 'longitude' | 'payment_method' | 'service_charge' |
  'total_price' | 'status' | 'created_at' | 'booking_type' |
  'scheduled_for' | 'scheduled_date' | 'scheduled_time_slot' | 'image_urls'
> {
  client?: {
    id: string;
    profile?: { full_name: string | null; phone: string | null };
  };
  // Dispatch metadata from notification
  response_window_seconds?: number;
  sent_at?: string;
}

export interface WorkerRequestsResponse {
  requests: IncomingJobRequest[];
  worker_status: 'online' | 'offline' | 'busy' | 'unavailable';
}

export interface DispatchStatusResponse {
  status: string;
  booking: Booking | null;
  dispatch: {
    current_radius_km: number;
    max_radius_km: number;
    attempt_count: number;
    max_attempts: number;
    current_worker_id?: string | null;
  } | null;
  time_left_seconds: number | null;
}

export interface WorkerAvailabilityResponse {
  status: 'online' | 'offline' | 'busy' | 'unavailable';
  is_online: boolean;
}

async function parseApi<T>(response: Response): Promise<T> {
  const payload = await response.json();
  if (!response.ok || !payload.success) {
    throw new Error(payload.error || `Request failed: ${response.status}`);
  }
  return payload.data as T;
}

export const dispatchService = {
  /**
   * Fetch the worker's live incoming job requests.
   * Only returns bookings still in `broadcasting` status.
   */
  async getIncomingRequests(): Promise<{ data: WorkerRequestsResponse | null; error: string | null }> {
    try {
      const res = await fetch('/api/worker/requests', { cache: 'no-store' });
      const data = await parseApi<WorkerRequestsResponse>(res);
      return { data, error: null };
    } catch (err: any) {
      return { data: null, error: err.message || 'Failed to load job requests' };
    }
  },

  /**
   * Atomically accept a broadcasting job.
   * First-accept-wins enforced by DB-level RPC.
   */
  async acceptJob(bookingId: string): Promise<{ data: Booking | null; error: string | null }> {
    try {
      const res = await fetch('/api/bookings/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ booking_id: bookingId }),
      });
      const data = await parseApi<Booking>(res);
      return { data, error: null };
    } catch (err: any) {
      return { data: null, error: err.message || 'Could not accept job' };
    }
  },

  /**
   * Explicitly reject an incoming job request.
   * Triggers immediate redispatch to the next eligible worker.
   */
  async rejectJob(
    bookingId: string,
    reason: 'not_available' | 'too_far' | 'not_my_category' | 'other' = 'other'
  ): Promise<{ success: boolean; error: string | null }> {
    try {
      const res = await fetch('/api/worker/requests/reject', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ booking_id: bookingId, reason }),
      });
      const payload = await res.json();
      if (!res.ok || !payload.success) throw new Error(payload.error || 'Rejection failed');
      return { success: true, error: null };
    } catch (err: any) {
      return { success: false, error: err.message || 'Could not reject job' };
    }
  },

  /**
   * Poll the dispatch status for a specific booking (customer-side).
   * Returns remaining search time and current dispatch radius.
   */
  async getDispatchStatus(bookingId: string): Promise<{ data: DispatchStatusResponse | null; error: string | null }> {
    try {
      const res = await fetch(`/api/bookings/dispatch-status?booking_id=${bookingId}`, {
        cache: 'no-store',
      });
      const data = await parseApi<DispatchStatusResponse>(res);
      return { data, error: null };
    } catch (err: any) {
      return { data: null, error: err.message || 'Failed to get dispatch status' };
    }
  },

  /**
   * Toggle worker online/offline availability.
   */
  async toggleAvailability(): Promise<{ data: WorkerAvailabilityResponse | null; error: string | null }> {
    try {
      const res = await fetch('/api/worker/availability/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await parseApi<WorkerAvailabilityResponse>(res);
      return { data, error: null };
    } catch (err: any) {
      return { data: null, error: err.message || 'Could not update availability' };
    }
  },

  /**
   * Get current worker availability status.
   */
  async getAvailability(): Promise<{ data: WorkerAvailabilityResponse | null; error: string | null }> {
    try {
      const res = await fetch('/api/worker/availability/toggle', { cache: 'no-store' });
      const data = await parseApi<WorkerAvailabilityResponse>(res);
      return { data, error: null };
    } catch (err: any) {
      return { data: null, error: err.message || 'Could not fetch availability' };
    }
  },
};
