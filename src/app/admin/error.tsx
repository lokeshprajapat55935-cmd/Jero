'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import { AlertOctagon, RotateCcw, LayoutDashboard } from 'lucide-react';
import { useRouter } from 'next/navigation';
import logger from '@/lib/logger';

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const router = useRouter();

  React.useEffect(() => {
    logger.error('Admin Panel Error:', error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center p-6 text-center w-full">
      <div className="mb-6 rounded-xl bg-red-500/10 p-5 text-red-500 ring-1 ring-red-500/20">
        <AlertOctagon size={48} strokeWidth={1.5} />
      </div>
      <h2 className="mb-3 text-2xl font-bold tracking-tight text-foreground">Admin Portal Error</h2>
      <p className="mb-8 text-muted-foreground font-medium max-w-sm text-sm">
        A system error occurred in the admin panel. Please check the logs.
      </p>
      <div className="flex gap-3">
        <Button 
          onClick={reset} 
          className="h-10 rounded-lg font-bold gap-2"
        >
          <RotateCcw size={16} /> Retry
        </Button>
        <Button 
          onClick={() => router.push('/admin')} 
          variant="outline" 
          className="h-10 rounded-lg font-bold gap-2"
        >
          <LayoutDashboard size={16} /> Admin Home
        </Button>
      </div>
    </div>
  );
}
