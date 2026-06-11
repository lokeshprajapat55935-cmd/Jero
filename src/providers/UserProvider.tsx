'use client';

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { authService } from '@/services/auth';
import { useToast } from '@/hooks/use-toast';
import { ROUTES } from '@/lib/constants';
import { DEV_OTP_CODE, isMockOtpEnabled } from '@/lib/auth/otp-provider';
import logger from '@/lib/logger';
import type { Profile } from '@/types';
import { auth } from '@/firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import { getSupabaseClient } from '@/lib/supabase/resolveClient';

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
    const targetUid = forceUid || user?.uid;
    if (targetUid) {
      await fetchProfile(targetUid);
    }
  }, [user, fetchProfile]);

  useEffect(() => {
    let active = true;

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

    if (!auth) {
      setLoading(false);
      return;
    }

    // 2. Single Source of Truth Auth Listener via Firebase
    const unsubscribe = onAuthStateChanged(auth, async (nextUser) => {
      if (!active) return;
      
      if (!nextUser) {
        // Fallback: Check if there's a Supabase user session (e.g. Admin)
        try {
          const supabase = await getSupabaseClient();
          const { data: { user: supabaseUser } } = await supabase.auth.getUser();
          
          if (supabaseUser) {
            // Found Supabase user, construct mock Firebase User representation
            const mockUser = {
              uid: supabaseUser.id,
              email: supabaseUser.email,
              phoneNumber: supabaseUser.phone,
            } as User;
            
            setUser(mockUser);
            if (typeof window !== 'undefined') {
              localStorage.setItem('zolvo-cached-user', JSON.stringify({ uid: supabaseUser.id, email: supabaseUser.email }));
              document.cookie = `zolvo_auth_uid=${supabaseUser.id}; path=/; max-age=2592000;`;
            }
            
            const result = await withTimeout(authService.getProfile(supabaseUser.id));
            const profileData = result?.data as Profile | null;
            if (active && profileData) {
              setProfile(profileData);
              if (typeof window !== 'undefined') {
                localStorage.setItem('zolvo-cached-profile', JSON.stringify(profileData));
              }
              const mappedRole = profileData.role === 'worker' ? 'partner' : profileData.role;
              document.cookie = `zolvo_role=${mappedRole}; path=/; max-age=2592000;`;
            }
            if (active) setLoading(false);
            return;
          }
        } catch (err) {
          logger.error('Failed to resolve Supabase fallback session in UserProvider', err);
        }

        // Skip clearing if we are using a mock test profile
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

      setUser(nextUser);
      if (typeof window !== 'undefined') {
        localStorage.setItem('zolvo-cached-user', JSON.stringify({ uid: nextUser.uid, phoneNumber: nextUser.phoneNumber }));
        document.cookie = `zolvo_auth_uid=${nextUser.uid}; path=/; max-age=2592000;`;
      }

      const hasCorrectProfileLoaded = profileRef.current && 
        (profileRef.current.firebase_uid === nextUser.uid || profileRef.current.id === nextUser.uid);

      if (!hasCorrectProfileLoaded) {
        if (active) setLoading(true);
        
        let profileData = null;
        try {
          const result = await withTimeout(authService.getProfile(nextUser.uid));
          profileData = result?.data as Profile | null;
        } catch (err) {
          logger.error('Error in onAuthStateChange profile fetch', err);
        }

        if (active) {
          if (profileData) {
            setProfile(profileData);
            if (typeof window !== 'undefined') {
              localStorage.setItem('zolvo-cached-profile', JSON.stringify(profileData));
              const mappedRole = profileData.role === 'worker' ? 'partner' : profileData.role;
              document.cookie = `zolvo_role=${mappedRole}; path=/; max-age=2592000;`;
            }
          }
          setLoading(false);
        }
      } else {
        // Background refresh
        try {
          const result = await withTimeout(authService.getProfile(nextUser.uid));
          const profileData = result?.data as Profile | null;
          if (active && profileData) {
            setProfile(profileData);
            if (typeof window !== 'undefined') {
              localStorage.setItem('zolvo-cached-profile', JSON.stringify(profileData));
              const mappedRole = profileData.role === 'worker' ? 'partner' : profileData.role;
              document.cookie = `zolvo_role=${mappedRole}; path=/; max-age=2592000;`;
            }
          }
        } catch (err) {
          logger.error('Background profile validation failed', err);
        }
        if (active) setLoading(false);
      }
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [fetchProfile, clearAuthCache]);

  const signOut = useCallback(async () => {
    // 1. Clear local caches
    clearAuthCache();
    setUser(null);
    setProfile(null);
    
    // 2. Clear Firebase Session
    try {
      if (auth) await auth.signOut();
    } catch (e) {
      logger.error('Error signing out of Firebase', e);
    }

    // 3. Clear Supabase & Next.js Cookies Session
    try {
      await authService.signOut();
    } catch (e) {
      logger.error('Error signing out of Supabase API', e);
    }
  }, [clearAuthCache]);

  const sendPhoneOtp = useCallback(async (phone: string) => {
    setIsLoading(true);
    // ... not actively used since page.tsx uses Firebase directly, but keeping for compatibility
    setIsLoading(false);
  }, []);

  const verifyPhoneOtp = useCallback(async (phone: string, token: string) => {
    setIsLoading(true);
    setIsLoading(false);
  }, []);

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
