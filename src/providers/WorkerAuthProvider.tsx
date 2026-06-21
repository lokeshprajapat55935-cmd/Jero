'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { authService } from '@/services/auth';
import { useToast } from '@/hooks/use-toast';
import { ROUTES } from '@/lib/constants';
import logger from '@/lib/logger';
import type { Profile } from '@/types';
import { createWorkerClient } from '@/lib/supabase/client';
import { UserContext } from './UserContext';
import { Session, AuthChangeEvent } from '@supabase/supabase-js';
import { config } from '@/config';
import type { User } from '@supabase/supabase-js';

const AUTH_TIMEOUT_MS = 5000;

function withTimeout<T>(promise: Promise<T>, timeoutMs = AUTH_TIMEOUT_MS): Promise<T | null> {
  return Promise.race([
    promise,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
  ]);
}

export function WorkerAuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();
  const { toast } = useToast();

  const profileRef = React.useRef<Profile | null>(null);
  useEffect(() => {
    profileRef.current = profile;
  }, [profile]);

  const clearAuthCache = useCallback(() => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('zolvo_worker_user');
      localStorage.removeItem('zolvo_worker_profile');
      document.cookie = 'zolvo_worker_uid=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
      document.cookie = 'zolvo_worker_role=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
    }
  }, []);

  const fetchProfile = useCallback(async (userId: string) => {
    try {
      const result = await withTimeout(authService.getProfile(userId));
      const profileData = result?.data as Profile | null;
      if (profileData) {
        setProfile(profileData);
        if (typeof window !== 'undefined') {
          localStorage.setItem('zolvo_worker_profile', JSON.stringify(profileData));
          const mappedRole = profileData.role === 'worker' ? 'partner' : profileData.role;
          document.cookie = `zolvo_worker_role=${mappedRole}; path=/; max-age=2592000;`;
        }
      }
      return profileData;
    } catch (error) {
      logger.error('Error in fetchProfile', error);
      return null;
    }
  }, []);

  const refreshProfile = useCallback(async (forceUid?: string) => {
    const targetUid = forceUid || user?.id;
    if (targetUid) {
      await fetchProfile(targetUid);
    }
  }, [user, fetchProfile]);

  useEffect(() => {
    let active = true;
    let subscription: any = null;

    async function setupAuth() {
      try {
        if (typeof window !== 'undefined') {
          const cachedUserJson = localStorage.getItem('zolvo_worker_user');
          const cachedProfileJson = localStorage.getItem('zolvo_worker_profile');

          if (cachedUserJson && cachedProfileJson) {
            setUser(JSON.parse(cachedUserJson));
            setProfile(JSON.parse(cachedProfileJson));
            setLoading(false);
          }
        }
      } catch (e) {
        logger.error('Error hydrating auth cache', e);
      }

      const supabase = createWorkerClient();
      
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user && active) {
        const supaUser = session.user;
        setUser(supaUser);
        const p = await fetchProfile(supaUser.id);
        if (p && p.role !== 'worker') {
             setUser(null);
             setProfile(null);
             clearAuthCache();
             await supabase.auth.signOut();
             router.push('/partner'); // go to worker login
        }
        setLoading(false);
      } else if (!session && active) {
        const isMockTest = typeof window !== 'undefined' && config.env.isDev &&
          ((localStorage.getItem('zolvo_worker_user') || '').includes('test_') || 
           document.cookie.includes('zolvo_worker_uid=test_'));
        
        if (!isMockTest) {
          setUser(null);
          setProfile(null);
          clearAuthCache();
        }
        setLoading(false);
      }

      const { data: { subscription: sub } } = supabase.auth.onAuthStateChange(async (event: AuthChangeEvent, session: Session | null) => {
        if (!active) return;
        logger.info(`[WorkerAuthProvider] Supabase Auth Event: ${event}`);

        const supabaseUser = session?.user;

        if (!supabaseUser) {
          const isMockTest = typeof window !== 'undefined' && config.env.isDev &&
            ((localStorage.getItem('zolvo_worker_user') || '').includes('test_') || 
             document.cookie.includes('zolvo_worker_uid=test_'));

          if (isMockTest) {
            if (active) setLoading(false);
            return;
          }

          setUser(null);
          setProfile(null);
          clearAuthCache();
          if (active) setLoading(false);
          return;
        }

        setUser(supabaseUser);
        if (typeof window !== 'undefined') {
          localStorage.setItem('zolvo_worker_user', JSON.stringify({ id: supabaseUser.id, email: supabaseUser.email }));
          document.cookie = `zolvo_worker_uid=${supabaseUser.id}; path=/; max-age=2592000;`;
        }

        const hasCorrectProfileLoaded = profileRef.current && 
          (profileRef.current.id === supabaseUser.id || profileRef.current.firebase_uid === supabaseUser.id);

        if (!hasCorrectProfileLoaded || event === 'SIGNED_IN') {
          if (active) setLoading(true);
          const p = await fetchProfile(supabaseUser.id);
          if (p && p.role !== 'worker') {
             setUser(null);
             setProfile(null);
             clearAuthCache();
             await supabase.auth.signOut();
             router.push('/partner');
          }
          if (active) setLoading(false);
        } else {
          fetchProfile(supabaseUser.id);
        }
      });
      
      subscription = sub;
    }

    setupAuth();

    return () => {
      active = false;
      if (subscription) subscription.unsubscribe();
    };
  }, [fetchProfile, clearAuthCache, router]);

  const signOut = useCallback(async () => {
    clearAuthCache();
    setUser(null);
    setProfile(null);
    try {
      await authService.signOut();
      const supabase = createWorkerClient();
      await supabase.auth.signOut();
    } catch (e) {
      logger.error('Error signing out', e);
    }
  }, [clearAuthCache]);

  const sendPhoneOtp = useCallback(async (phone: string) => {
    setIsLoading(true);
    try {
      await authService.sendOtp(phone);
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  const verifyPhoneOtp = useCallback(async (phone: string, token: string) => {
    setIsLoading(true);
    try {
      const result = await authService.verifyOtp(phone, token);
      const { email, password } = result.credentials;
      const { error } = await authService.signIn(email, password);
      if (error) throw error;
    } catch (err: any) {
      toast({ title: 'Verification Failed', description: err.message, variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  const logout = useCallback(async () => {
    await signOut();
    router.push('/partner');
    router.refresh();
  }, [router, signOut]);

  const value = React.useMemo(() => ({
    user,
    profile,
    loading,
    isLoading,
    signOut,
    refreshProfile,
    sendPhoneOtp,
    verifyPhoneOtp,
    logout
  }), [user, profile, loading, isLoading, signOut, refreshProfile, sendPhoneOtp, verifyPhoneOtp, logout]);

  return (
    <UserContext.Provider value={value}>
      {children}
    </UserContext.Provider>
  );
}
