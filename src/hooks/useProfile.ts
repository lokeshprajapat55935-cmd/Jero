import { useState, useEffect, useCallback } from 'react';
import { profileApi, CustomerProfile, CustomerWallet, CustomerSettings, ActivitySummary } from '@/services/profile.api';
import toast from 'react-hot-toast';

export function useProfile() {
  const [profile, setProfile] = useState<CustomerProfile | null>(null);
  const [wallet, setWallet] = useState<CustomerWallet | null>(null);
  const [settings, setSettings] = useState<CustomerSettings | null>(null);
  const [activitySummary, setActivitySummary] = useState<ActivitySummary | null>(null);
  
  const [isLoading, setIsLoading] = useState(true);
  const [isOffline, setIsOffline] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      // Fetch in parallel for speed
      const [profRes, walletRes, settingsRes, activityRes] = await Promise.all([
        profileApi.getProfile(),
        profileApi.getWallet(),
        profileApi.getSettings(),
        profileApi.getActivitySummary()
      ]);
      
      setProfile(profRes.data || {} as CustomerProfile);
      setWallet(walletRes.data || { balance: 0, currency: 'INR', status: 'active' });
      setSettings(settingsRes.data || { push_notifications: false, email_notifications: false, whatsapp_updates: false, language: 'en' });
      setActivitySummary(activityRes.data || { total_bookings: 0, active_bookings: 0, completed_bookings: 0 });
      
      // If profile failed completely (network issue etc)
      if (profRes.error && !isOffline) {
        setError('Failed to load profile data. Showing fallback.');
      }
    } catch (err: any) {
      if (!isOffline) {
        setError('Failed to load profile data. Please try again.');
      }
    } finally {
      setIsLoading(false);
    }
  }, [isOffline]);

  useEffect(() => {
    let isMounted = true;
    const handleOnline = () => {
      if (isMounted) setIsOffline(false);
      fetchData();
    };
    const handleOffline = () => {
      if (isMounted) setIsOffline(true);
    };
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    if (!window.navigator.onLine && isMounted) setIsOffline(true);

    fetchData();

    return () => {
      isMounted = false;
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [fetchData]);

  const updateProfile = async (updates: Partial<CustomerProfile>) => {
    const loadingToast = toast.loading('Updating profile...');
    try {
      const res = await profileApi.updateProfile(updates);
      if (res.error) {
        toast.error(res.error, { id: loadingToast });
        return false;
      }
      setProfile(prev => ({ ...(prev as CustomerProfile), ...(res.data as CustomerProfile) }));
      toast.success('Profile updated', { id: loadingToast });
      return true;
    } catch (err: any) {
      toast.error(err.message || 'Update failed', { id: loadingToast });
      return false;
    }
  };

  const updateSettings = async (updates: Partial<CustomerSettings>) => {
    // Optimistic UI update
    setSettings(prev => prev ? { ...prev, ...updates } : null);
    try {
      const res = await profileApi.updateSettings(updates);
      if (res.error) {
        toast.error('Failed to update settings');
        fetchData(); // Revert
        return false;
      }
      setSettings(prev => ({ ...(prev as CustomerSettings), ...(res.data as CustomerSettings) }));
      return true;
    } catch (err: any) {
      toast.error('Failed to update settings');
      // Revert on failure
      fetchData();
      return false;
    }
  };

  return {
    profile,
    wallet,
    settings,
    activitySummary,
    isLoading,
    isOffline,
    error,
    refetch: fetchData,
    updateProfile,
    updateSettings
  };
}
