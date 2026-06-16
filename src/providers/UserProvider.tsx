'use client';

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { authService } from '@/services/auth';
import { useToast } from '@/hooks/use-toast';
import { ROUTES } from '@/lib/constants';
import logger from '@/lib/logger';
import type { Profile } from '@/types';
import { getSupabaseClient } from '@/lib/supabase/resolveClient';
import type { User, AuthChangeEvent, Session } from '@supabase/supabase-js';

interface UserContextType {
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  isLoading: boolean;
  signOut: () => Promise<void>;
  refreshProfile: (forceUid?: string) => Promise<void>;
  sendPhoneOtp: (phone: string) => Promise<void>;
  verifyPhoneOtp: (phone: string, token: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AUTH_TIMEOUT_MS = 5000;

function withTimeout<T>(promise: Promise<T>, timeoutMs = AUTH_TIMEOUT_MS): Promise<T | null> {
  return Promise.race([
    promise,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
  ]);
}

const UserContext = createContext<UserContextType | undefined>(undefined);

export function UserProvider({ children }: { children: React.ReactNode }) {
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
      localStorage.removeItem('zolvo-cached-user');
      localStorage.removeItem('zolvo-cached-profile');
      document.cookie = 'zolvo_auth_uid=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
      document.cookie = 'zolvo_role=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
    }
  }, []);

  const fetchProfile = useCallback(async (userId: string) => {
    try {
      const result = await withTimeout(authService.getProfile(userId));
      const profileData = result?.data as Profile | null;
      if (profileData) {
        setProfile(profileData);
        if (typeof window !== 'undefined') {
          localStorage.setItem('zolvo-cached-profile', JSON.stringify(profileData));
          // Keep cookie in sync
          const mappedRole = profileData.role === 'worker' ? 'partner' : profileData.role;
          document.cookie = `zolvo_role=${mappedRole}; path=/; max-age=2592000;`;
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
          const cachedUserJson = localStorage.getItem('zolvo-cached-user');
          const cachedProfileJson = localStorage.getItem('zolvo-cached-profile');

          if (cachedUserJson && cachedProfileJson) {
            setUser(JSON.parse(cachedUserJson));
            setProfile(JSON.parse(cachedProfileJson));
            setLoading(false);
          }
        }
      } catch (e) {
        logger.error('Error hydrating auth cache', e);
      }

      const supabase = await getSupabaseClient();
      
      // 1. Check current session immediately
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user && active) {
        const supaUser = session.user;
        setUser(supaUser);
        await fetchProfile(supaUser.id);
        setLoading(false);
      } else if (!session && active) {
        // Only clear if not in mock test mode
        const isMockTest = typeof window !== 'undefined' && 
          ((localStorage.getItem('zolvo-cached-user') || '').includes('test_') || 
           document.cookie.includes('zolvo_auth_uid=test_'));
        
        if (!isMockTest) {
          setUser(null);
          setProfile(null);
          clearAuthCache();
        }
        setLoading(false);
      }

      // 2. Supabase Auth Listener (Primary Source of Truth)
      const { data: { subscription: sub } } = supabase.auth.onAuthStateChange(async (event: AuthChangeEvent, session: Session | null) => {
        if (!active) return;
        logger.info(`[UserProvider] Supabase Auth Event: ${event}`);

        const supabaseUser = session?.user;

        if (!supabaseUser) {
          // No session
          const isMockTest = typeof window !== 'undefined' && 
            ((localStorage.getItem('zolvo-cached-user') || '').includes('test_') || 
             document.cookie.includes('zolvo_auth_uid=test_'));

          if (isMockTest) {
            logger.info('[UserProvider] Preserving injected mock/test auth session');
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
          localStorage.setItem('zolvo-cached-user', JSON.stringify({ id: supabaseUser.id, email: supabaseUser.email }));
          document.cookie = `zolvo_auth_uid=${supabaseUser.id}; path=/; max-age=2592000;`;
        }

        const hasCorrectProfileLoaded = profileRef.current && 
          (profileRef.current.id === supabaseUser.id || profileRef.current.firebase_uid === supabaseUser.id);

        if (!hasCorrectProfileLoaded || event === 'SIGNED_IN') {
          if (active) setLoading(true);
          await fetchProfile(supabaseUser.id);
          if (active) setLoading(false);
        } else {
          // Background refresh
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
  }, [fetchProfile, clearAuthCache]);

  const signOut = useCallback(async () => {
    // 1. Clear local caches
    clearAuthCache();
    setUser(null);
    setProfile(null);
    
    // 2. Clear Supabase & Next.js Cookies Session
    try {
      await authService.signOut();
      const supabase = await getSupabaseClient();
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
    router.push(ROUTES.AUTH.LOGIN);
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

export const defaultUserState: UserContextType = {
  user: null,
  profile: null,
  loading: false,
  isLoading: false,
  signOut: async () => {},
  refreshProfile: async (forceUid?: string) => {},
  sendPhoneOtp: async () => {},
  verifyPhoneOtp: async () => {},
  logout: async () => {},
};

export function useUser() {
  const context = useContext(UserContext);
  if (context === undefined) {
    console.error("UserProvider missing! Returning default fallback state to prevent crash.");
    return defaultUserState;
  }
  return context;
}
