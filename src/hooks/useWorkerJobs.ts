'use client';

import { useState, useEffect, useCallback } from 'react';
import { bookingService } from '@/services/booking';
import { Booking } from '@/types';
import { createClient } from '@/lib/supabase/client';
import toast from 'react-hot-toast';

const ACTIVE_STATUSES = new Set([
  'accepted', 'worker_arriving', 'en_route', 'arrived', 
  'work_started', 'started', 'in_progress', 
  'work_completed', 'work_completed_pending_otp', 'awaiting_otp', 'otp_generated',
  'awaiting_item_approval', 'item_approved', 'otp_verified',
  'awaiting_payment', 'payment_processing', 'payment_verified'
]);

const COMPLETED_STATUSES = new Set(['completed', 'paid_completed', 'cancelled', 'disputed']);

export function useWorkerJobs(workerId: string | null) { 
  const [newJobs, setNewJobs] = useState<Booking[]>([]); 
  const [activeJobs, setActiveJobs] = useState<Booking[]>([]);
  const [completedJobs, setCompletedJobs] = useState<Booking[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchJobs = useCallback(async (silent = false) => {
    if (!workerId) return;
    if (!silent) setIsLoading(true);
    setError(null);
    try {
      const { data } = await bookingService.getMyBookings('worker');
      const all = data ?? [];
      setNewJobs(all.filter((b) => b.status === 'broadcasting'));
      setActiveJobs(all.filter((b) => ACTIVE_STATUSES.has(b.status)));
      setCompletedJobs(all.filter((b) => COMPLETED_STATUSES.has(b.status)));
    } catch (err: any) {
      setError(err.message || 'Failed to load jobs');
    } finally {
      setIsLoading(false);
    }
  }, [workerId]);

  useEffect(() => {
    if (!workerId) return;
    fetchJobs();

    const supabase = createClient();

    // Listen to bookings where this worker is assigned
    const channel = supabase
      .channel(`worker-jobs-${workerId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'bookings',
          filter: `worker_id=eq.${workerId}`,
        },
        () => fetchJobs(true)
      )
      // Also listen for new broadcasting jobs (notifications table)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${workerId}`,
        },
        (payload: any) => {
          if (payload.new?.type === 'booking_request') {
            fetchJobs(true);
            toast('New job request!', { icon: '🔔' });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [workerId, fetchJobs]);

  const acceptJob = useCallback(async (bookingId: string) => {
    const toastId = toast.loading('Accepting job...');
    try {
      await bookingService.acceptBooking(bookingId);
      toast.success('Job accepted!', { id: toastId });
      fetchJobs(true);
    } catch (err: any) {
      toast.error(err.message || 'Failed to accept', { id: toastId });
    }
  }, [fetchJobs]);

  return {
    newJobs,
    activeJobs,
    completedJobs,
    isLoading,
    error,
    fetchJobs,
    acceptJob,
  };
}
