'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { dispatchService, IncomingJobRequest } from '@/services/dispatch.service';
import toast from 'react-hot-toast';

interface UseDispatchReturn {
  incomingJobs: IncomingJobRequest[];
  isLoading: boolean;
  isRealtimeConnected: boolean;
  error: string | null;
  workerStatus: string;
  acceptJob: (bookingId: string) => Promise<boolean>;
  rejectJob: (bookingId: string, reason?: any) => Promise<boolean>;
  refresh: () => void;
}

const POLLING_INTERVAL_MS = 5_000; // Fallback poll every 5 seconds

export function useDispatch(workerId: string | null | undefined): UseDispatchReturn {
  const [incomingJobs, setIncomingJobs] = useState<IncomingJobRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRealtimeConnected, setIsRealtimeConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [workerStatus, setWorkerStatus] = useState('offline');
  const [acceptingId, setAcceptingId] = useState<string | null>(null);

  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef = useRef(true);

  // ── Core fetch ────────────────────────────────────────────────────────────
  const fetchRequests = useCallback(async (silent = false) => {
    if (!workerId) return;
    if (!silent) setIsLoading(true);
    setError(null);

    const { data, error: fetchError } = await dispatchService.getIncomingRequests();

    if (!mountedRef.current) return;

    if (fetchError) {
      if (!silent) setError(fetchError);
    } else if (data) {
      setIncomingJobs(data.requests);
      setWorkerStatus(data.worker_status);
    }

    if (!silent) setIsLoading(false);
  }, [workerId]);

  // ── Accept job (atomic, first-accept-wins) ───────────────────────────────
  const acceptJob = useCallback(async (bookingId: string): Promise<boolean> => {
    if (acceptingId) return false; // Prevent double-tapping
    setAcceptingId(bookingId);

    const toastId = toast.loading('Accepting job...');
    const { data, error: acceptError } = await dispatchService.acceptJob(bookingId);

    setAcceptingId(null);

    if (acceptError) {
      // Could be a race — another worker got there first
      const alreadyTaken =
        acceptError.toLowerCase().includes('already') ||
        acceptError.toLowerCase().includes('conflict') ||
        acceptError.toLowerCase().includes('409');

      if (alreadyTaken) {
        toast.error('Job already taken by another worker.', { id: toastId });
      } else {
        toast.error(acceptError || 'Could not accept job.', { id: toastId });
      }

      // Remove the job from local state regardless (it's no longer available)
      setIncomingJobs((prev) => prev.filter((j) => j.id !== bookingId));
      return false;
    }

    toast.success('Job accepted! Check your Active tab.', { id: toastId });
    // Remove from incoming feed
    setIncomingJobs((prev) => prev.filter((j) => j.id !== bookingId));
    return true;
  }, [acceptingId]);

  // ── Reject job ────────────────────────────────────────────────────────────
  const rejectJob = useCallback(async (bookingId: string, reason?: any): Promise<boolean> => {
    const toastId = toast.loading('Rejecting job...');
    const { success, error: rejectError } = await dispatchService.rejectJob(bookingId, reason);
    
    if (rejectError) {
      toast.error(rejectError || 'Could not reject job.', { id: toastId });
      return false;
    }

    toast.success('Job rejected.', { id: toastId });
    setIncomingJobs((prev) => prev.filter((j) => j.id !== bookingId));
    return true;
  }, []);

  // ── Initial load ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!workerId) {
      setIsLoading(false);
      return;
    }
    fetchRequests();
  }, [workerId, fetchRequests]);

  // ── Supabase Realtime subscription ────────────────────────────────────────
  useEffect(() => {
    if (!workerId) return;

    const supabase = createClient();

    const channel = supabase
      .channel(`dispatch-worker-${workerId}`)
      // postgres_changes: fires on any INSERT to notifications for this worker.
      // NOTE: With REPLICA IDENTITY DEFAULT (the Supabase default), payload.new
      // only contains the primary key. After migration 20260630 sets REPLICA
      // IDENTITY FULL, it will contain the full row including `type` and
      // `metadata`. We handle BOTH cases here: if type is present we filter,
      // otherwise we always refetch to be safe.
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${workerId}`,
        },
        (payload: any) => {
          const type = payload.new?.type;

          // If type is present (REPLICA IDENTITY FULL), filter precisely
          if (type === 'booking_request') {
            fetchRequests(true);
            if ('vibrate' in navigator) navigator.vibrate([200, 100, 200]);
            return;
          }

          if (type === 'booking_request_cancelled') {
            const cancelledBookingId = payload.new?.metadata?.booking_id;
            if (cancelledBookingId) {
              setIncomingJobs((prev) => prev.filter((j) => j.id !== cancelledBookingId));
            }
            return;
          }

          // If type is missing (REPLICA IDENTITY DEFAULT — payload only has PK),
          // refetch proactively. The /api/worker/requests endpoint will filter
          // for only booking_request notifications, so this is safe.
          if (!type) {
            fetchRequests(true);
          }
        }
      )
      .subscribe((status: string, err?: Error) => {
        if (mountedRef.current) {
          setIsRealtimeConnected(status === 'SUBSCRIBED');
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            // Log for diagnostics but don't crash — polling fallback covers us
            console.warn('[useDispatch] Realtime channel error:', status, err?.message);
          }
        }
      });

    // ── Polling fallback ───────────────────────────────────────────────────
    // Runs regardless — ensures consistency even if Realtime hiccups
    pollingRef.current = setInterval(() => {
      fetchRequests(true);
    }, POLLING_INTERVAL_MS);

    return () => {
      mountedRef.current = false;
      supabase.removeChannel(channel);
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [workerId, fetchRequests]);

  // Reset mounted on unmount
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  return {
    incomingJobs,
    isLoading,
    isRealtimeConnected,
    error,
    workerStatus,
    acceptJob,
    rejectJob,
    refresh: () => fetchRequests(true),
  };
}
