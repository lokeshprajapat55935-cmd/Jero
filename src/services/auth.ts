import { getSupabaseClient } from '@/lib/supabase/resolveClient';
import { toE164IndianMobile } from '@/lib/phone';
import logger from '@/lib/logger';

type ApiResponse<T> = {
  success: boolean;
  data?: T;
  error?: string;
};

async function postOtp<T>(body: Record<string, unknown>) {
  const response = await fetch('/api/auth/otp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const payload = (await response.json()) as ApiResponse<T>;

  if (!response.ok || !payload.success || !payload.data) {
    throw new Error(payload.error || 'OTP request failed.');
  }

  return payload.data;
}

export const authService = {
  async sendOtp(phone: string) {
    const response = await postOtp<any>({ action: 'start', phone });
    return response;
  },

  async verifyOtp(phone: string, token: string) {
    const response = await postOtp<any>({ action: 'verify', phone, token });
    return response;
  },

  async signIn(email: string, password: string) {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    return { data, error };
  },


  async signOut() {
    try {
      const response = await fetch('/api/auth/logout', { method: 'POST' });
      const payload = await response.json();
      return { error: payload.success ? null : new Error(payload.error || 'Failed to logout') };
    } catch (error: any) {
      return { error };
    }
  },

  async getUser() {
    const supabase = await getSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    return user;
  },

  async getProfile(userId: string) {
    if (!userId || userId === 'undefined' || userId === 'null') {
      logger.warn('authService.getProfile called with invalid userId', { userId });
      return { data: null, error: new Error('Invalid userId') };
    }

    try {
      const supabase = await getSupabaseClient();
      const isUuid = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(userId);

      let query = supabase.from('profiles').select('*');
      if (isUuid) {
        query = query.or(`id.eq.${userId},firebase_uid.eq.${userId}`);
      } else {
        query = query.eq('firebase_uid', userId);
      }

      const { data, error } = await query.maybeSingle();

      if (error) {
        logger.error('Supabase error fetching profile:', error);
        return { data: null, error };
      }

      return { data, error: null };
    } catch (err: any) {
      logger.error('Unexpected error in getProfile:', err);
      return { data: null, error: err };
    }
  },

  async ensureProfile(userId: string, phone: string, intent: 'client' | 'partner' = 'client') {
    try {
      logger.info('Calling server-side ensure-profile API', { userId, phone, intent });
      const response = await fetch('/api/auth/ensure-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, phone, intent }),
      });

      const payload = await response.json();

      if (!response.ok || !payload.success) {
        throw new Error(payload.error || 'Failed to ensure user profile');
      }

      const { profile: data, specificData, requiresOnboarding } = payload.data;
      
      logger.info('Successfully assured profile from API:', { 
        userId, 
        role: data?.role,
        onboarded: data?.onboarded,
      });

      return { data, specificData, requiresOnboarding, error: null };
    } catch (err: any) {
      logger.error('Database error or API failure in ensureProfile:', err);
      // Return the actual error object rather than fallback logic
      return { data: null, specificData: null, requiresOnboarding: false, error: err };
    }
  },
};
