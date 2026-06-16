"use client";

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { FileQuestion } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default function NotFound() {
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center p-6 text-center">
      <div className="mb-4 rounded-full bg-secondary p-4 text-muted-foreground">
        <FileQuestion size={48} />
      </div>
      <h2 className="mb-2 text-2xl font-bold">Page Not Found</h2>
      <p className="mb-8 text-muted-foreground">
        The page you are looking for doesn&apos;t exist or has been moved.
      </p>
      <Link href="/">
        <Button>Return Home</Button>
      </Link>
    </div>
  );
}
