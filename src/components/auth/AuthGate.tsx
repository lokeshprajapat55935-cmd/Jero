'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useUser } from '@/providers/UserProvider';
import { ROUTES } from '@/lib/constants';
import { AuthLoading } from '@/components/auth/AuthLoading';

type AuthGateProps = {
  children: React.ReactNode;
  requireAuth?: boolean;
  requireOnboarded?: boolean;
  allowedRoles?: Array<'client' | 'worker' | 'admin'>;
  fallbackHref?: string;
};

export function AuthGate({
  children,
  requireAuth = true,
  requireOnboarded = true,
  allowedRoles,
  fallbackHref = ROUTES.AUTH.LOGIN,
}: AuthGateProps) {
  const { user, profile, loading } = useUser();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;

    if (requireAuth && !user) {
      const next = typeof window !== 'undefined' ? window.location.pathname : '/';
      router.replace(`${fallbackHref}?next=${encodeURIComponent(next)}`);
      return;
    }

    if (requireOnboarded && user && (!profile || !profile.onboarded)) {
      router.replace(ROUTES.AUTH.LOGIN);
      return;
    }

    if (allowedRoles?.length && (!profile || !allowedRoles.includes(profile.role))) {
      router.replace('/');
    }
  }, [loading, user, profile, requireAuth, requireOnboarded, allowedRoles, router, fallbackHref]);

  if (loading) {
    return <AuthLoading label="Checking your session..." />;
  }

  if (requireAuth && !user) {
    return <AuthLoading label="Redirecting to login..." />;
  }

  if (requireOnboarded && user && (!profile || !profile.onboarded)) {
    return <AuthLoading label="Finishing setup..." />;
  }

  if (allowedRoles?.length && (!profile || !allowedRoles.includes(profile.role))) {
    return <AuthLoading label="Redirecting..." />;
  }

  return <>{children}</>;
}