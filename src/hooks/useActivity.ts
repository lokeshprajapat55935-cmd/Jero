import { useState, useEffect, useCallback } from 'react';
import { activityApi, ActivityFilterType, ActivityItem } from '@/services/activity.api';
import { createClient } from '@/lib/supabase/client';
import toast from 'react-hot-toast';

export function useActivity(userId?: string) {
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [filter, setFilter] = useState<ActivityFilterType>('all');
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isOffline, setIsOffline] = useState(false);

  const supabase = createClient();

  const fetchActivities = useCallback(async (isSilent = false) => {
    if (!isSilent) setIsLoading(true);
    else setIsRefreshing(true);
    
    setError(null);
    try {
      const data = await activityApi.getActivities(filter);
      setActivities(data);
    } catch (err: any) {
      if (isOffline) {
        setError('You are offline. Showing cached data if available.');
      } else {
        setError(err.message || 'Failed to load activity');
      }
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [filter, isOffline]);

  // Initial fetch and network listeners
  useEffect(() => {
    const handleOnline = () => {
      setIsOffline(false);
      fetchActivities(true);
    };
    const handleOffline = () => setIsOffline(true);
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    if (!window.navigator.onLine) setIsOffline(true);

    fetchActivities();

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [fetchActivities]);

  // Supabase Real-time Subscription
  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel('activity-updates')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'bookings',
          filter: `client_id=eq.${userId}`
        },
        (payload: any) => {
          // Instead of manually patching complex nested objects (like workers and profiles),
          // simply trigger a silent refetch to get the accurate hydrated state.
          fetchActivities(true);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, fetchActivities, supabase]);

  const cancelBooking = async (id: string) => {
    const loadingToast = toast.loading('Cancelling booking...');
    try {
      await activityApi.cancelBooking(id);
      toast.success('Booking cancelled', { id: loadingToast });
      fetchActivities(true);
    } catch (err: any) {
      toast.error(err.message, { id: loadingToast });
    }
  };

  const rebook = async (id: string) => {
    const loadingToast = toast.loading('Rebooking service...');
    try {
      const data = await activityApi.rebook(id);
      toast.success('Service rebooked successfully', { id: loadingToast });
      fetchActivities(true);
      return data.booking_id;
    } catch (err: any) {
      toast.error(err.message, { id: loadingToast });
      return null;
    }
  };

  return {
    activities,
    filter,
    setFilter,
    isLoading,
    isRefreshing,
    error,
    isOffline,
    fetchActivities,
    cancelBooking,
    rebook,
  };
}
