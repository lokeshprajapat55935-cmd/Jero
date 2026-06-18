import { createContext, useContext } from 'react';
import type { User } from '@supabase/supabase-js';
import type { Profile } from '@/types';

export interface UserContextType {
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

export const UserContext = createContext<UserContextType | undefined>(undefined);

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
