'use client';

/**
 * useAuth — thin re-export of the UserProvider context for backwards compatibility.
 *
 * All auth state (user, loading) and actions (sendPhoneOtp, verifyPhoneOtp, logout)
 * are now managed centrally in UserProvider with a single Supabase subscription.
 *
 * Components that already import useAuth will continue to work without changes.
 */
export { useUser as useAuth } from '@/providers/UserProvider';
