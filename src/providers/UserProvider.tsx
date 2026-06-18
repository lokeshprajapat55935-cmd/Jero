'use client';

import React from 'react';
import { usePathname } from 'next/navigation';
import { CustomerAuthProvider } from './CustomerAuthProvider';
import { WorkerAuthProvider } from './WorkerAuthProvider';
export { useUser, defaultUserState } from './UserContext';

export function UserProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  // Route any request starting with /partner or /worker to the Worker Auth logic
  if (pathname?.startsWith('/partner') || pathname?.startsWith('/worker')) {
    return <WorkerAuthProvider>{children}</WorkerAuthProvider>;
  }

  // Default to Customer Auth logic for all other routes
  return <CustomerAuthProvider>{children}</CustomerAuthProvider>;
}
