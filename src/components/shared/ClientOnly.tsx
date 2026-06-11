'use client';

import { useIsMounted } from '@/hooks';

type ClientOnlyProps = {
  children: React.ReactNode;
  fallback?: React.ReactNode;
};

export function ClientOnly({ children, fallback = null }: ClientOnlyProps) {
  const mounted = useIsMounted();
  if (!mounted) return <>{fallback}</>;
  return <>{children}</>;
}