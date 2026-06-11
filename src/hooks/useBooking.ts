'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { bookingService } from '@/services/booking';
import { Booking } from '@/types';
import toast from 'react-hot-toast';

export function useBooking(bookingId: string | null) {
  const [booking, setBooking] = useState<Booking | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const unsubscribeRef = useRef<(() => void) | null>(null);

  const fetchBooking = useCallback(async () => {
    if (!bookingId) { setIsLoading(false); return; }
    try {
      const data = await bookingService.getBooking(bookingId);
      setBooking(data);
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Failed to load booking');
    } finally {
      setIsLoading(false);
    }
  }, [bookingId]);

  // Initial fetch + Supabase Realtime subscription + Polling fallback
  useEffect(() => {
    if (!bookingId) return;
    fetchBooking();

    const unsub = bookingService.subscribeToBooking(bookingId, (updated) => {
      setBooking(updated);
    });
    unsubscribeRef.current = unsub;

    const pollInterval = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      fetchBooking();
    }, 10000);

    return () => {
      unsubscribeRef.current?.();
      clearInterval(pollInterval);
    };
  }, [bookingId, fetchBooking]);

  const updateStatus = useCallback(async (
    status: Booking['status'],
    reason?: string,
    payment_status?: 'pending' | 'paid'
  ) => {
    if (!bookingId) return;
    setIsUpdating(true);
    const toastId = toast.loading(`Updating booking...`);
    try {
      const updated = await bookingService.updateStatus(bookingId, status, reason, payment_status);
      setBooking(updated);
      toast.success('Booking updated', { id: toastId });
      return updated;
    } catch (err: any) {
      toast.error(err.message || 'Failed to update booking', { id: toastId });
      throw err;
    } finally {
      setIsUpdating(false);
    }
  }, [bookingId]);

  const acceptBooking = useCallback(async () => {
    if (!bookingId) return;
    setIsUpdating(true);
    const toastId = toast.loading('Accepting job...');
    try {
      const updated = await bookingService.acceptBooking(bookingId);
      setBooking(updated);
      toast.success('Job accepted!', { id: toastId });
      return updated;
    } catch (err: any) {
      toast.error(err.message || 'Failed to accept job', { id: toastId });
      throw err;
    } finally {
      setIsUpdating(false);
    }
  }, [bookingId]);

  const verifyOtp = useCallback(async (otp: string) => {
    if (!bookingId) return;
    setIsUpdating(true);
    const toastId = toast.loading('Verifying OTP...');
    try {
      const updated = await bookingService.verifyOtp(bookingId, otp);
      setBooking(updated);
      toast.success('OTP verified! Job complete.', { id: toastId });
      return updated;
    } catch (err: any) {
      toast.error(err.message || 'Invalid OTP', { id: toastId });
      throw err;
    } finally {
      setIsUpdating(false);
    }
  }, [bookingId]);

  const verifyPayment = useCallback(async (
    payment_method: 'cash' | 'upi' | 'card',
    payment_reference?: string
  ) => {
    if (!bookingId) return;
    setIsUpdating(true);
    const toastId = toast.loading('Processing payment...');
    try {
      const updated = await bookingService.verifyPayment({
        booking_id: bookingId,
        payment_method,
        payment_reference,
      });
      setBooking(updated);
      toast.success('Payment confirmed!', { id: toastId });
      return updated;
    } catch (err: any) {
      toast.error(err.message || 'Payment failed', { id: toastId });
      throw err;
    } finally {
      setIsUpdating(false);
    }
  }, [bookingId]);

  return {
    booking,
    isLoading,
    isUpdating,
    error,
    fetchBooking,
    updateStatus,
    acceptBooking,
    verifyOtp,
    verifyPayment,
  };
}
