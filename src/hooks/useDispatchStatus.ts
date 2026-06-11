'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { dispatchService, DispatchStatusResponse } from '@/services/dispatch.service';

const POLL_INTERVAL_MS = 5_000;

interface UseDispatchStatusReturn {
  dispatchData: DispatchStatusResponse | null;
  isSearching: boolean;
  timeLeftSeconds: number | null;
  isWorkerFound: boolean;
  error: string | null;
}

/**
 * Customer-side hook that polls dispatch status while a booking is broadcasting.
 * Automatically stops polling once a worker is found.
 */
export function useDispatchStatus(
  bookingId: string | null,
  currentStatus: string | null
): UseDispatchStatusReturn {
  const [dispatchData, setDispatchData] = useState<DispatchStatusResponse | null>(null);
  const [timeLeftSeconds, setTimeLeftSeconds] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef = useRef(true);

  const isBroadcasting = currentStatus === 'broadcasting' || currentStatus === 'pending';
  const isWorkerFound = !isBroadcasting && currentStatus !== null && currentStatus !== 'cancelled';

  const poll = useCallback(async () => {
    if (!bookingId || !isBroadcasting) return;
    const { data, error: pollError } = await dispatchService.getDispatchStatus(bookingId);
    if (!mountedRef.current) return;
    if (pollError) {
      setError(pollError);
      return;
    }
    if (data) {
      setDispatchData(data);
      setTimeLeftSeconds(data.time_left_seconds);
      setError(null);
    }
  }, [bookingId, isBroadcasting]);

  useEffect(() => {
    mountedRef.current = true;

    if (!bookingId || !isBroadcasting) {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }

    // Initial fetch
    poll();

    // Poll every 5 seconds
    timerRef.current = setInterval(poll, POLL_INTERVAL_MS);

    return () => {
      mountedRef.current = false;
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [bookingId, isBroadcasting, poll]);

  // Countdown timer — decrement locally between polls
  useEffect(() => {
    if (timeLeftSeconds === null || timeLeftSeconds <= 0) return;
    const countdown = setInterval(() => {
      setTimeLeftSeconds((prev) => (prev !== null && prev > 0 ? prev - 1 : prev));
    }, 1000);
    return () => clearInterval(countdown);
  }, [timeLeftSeconds]);

  return {
    dispatchData,
    isSearching: isBroadcasting,
    timeLeftSeconds,
    isWorkerFound,
    error,
  };
}
