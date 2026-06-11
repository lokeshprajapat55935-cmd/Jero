'use client';

import React from 'react';
import { useUser } from '@/providers/UserProvider';
import { AuthLoading } from '@/components/auth/AuthLoading';

interface RoleGuardProps {
  children: React.ReactNode;
  allowedRoles: ('client' | 'worker' | 'admin')[];
  fallback?: React.ReactNode;
}

export function RoleGuard({ children, allowedRoles, fallback = null }: RoleGuardProps) {
  const { profile, loading } = useUser();

  if (loading) return <AuthLoading label="Loading..." />;

  if (!profile || !allowedRoles.includes(profile.role)) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}
