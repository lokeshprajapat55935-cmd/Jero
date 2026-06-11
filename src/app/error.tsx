'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import { AlertCircle, RotateCcw } from 'lucide-react';
import { useI18n } from '@/providers/I18nProvider';
import logger from '@/lib/logger';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const { t } = useI18n();

  React.useEffect(() => {
    // Log the error to our structured logging service
    logger.error('Unhandled UI boundary error occurred', error);
  }, [error]);

  const isChunkError = error.name === 'ChunkLoadError' || error.message?.includes('Loading chunk');

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center p-6 text-center">
      <div className="mb-4 rounded-full bg-destructive/10 p-4 text-destructive">
        <AlertCircle size={48} />
      </div>
      <h2 className="mb-2 text-2xl font-bold">
        {isChunkError ? "App Update Available" : t("errors.somethingWrong")}
      </h2>
      <p className="mb-8 text-muted-foreground max-w-md">
        {isChunkError 
          ? "A new version of Zolvo is available. Please refresh the page to load the latest updates." 
          : "An unexpected error occurred. We've been notified and are working on a fix."}
      </p>
      <div className="flex gap-4">
        <Button onClick={() => window.location.href = '/'} variant="outline">
          {t("common.home")}
        </Button>
        <Button onClick={() => isChunkError ? window.location.reload() : reset()} className="gap-2">
          <RotateCcw size={16} /> {isChunkError ? "Reload Page" : t("errors.tryAgain")}
        </Button>
      </div>
    </div>
  );
}
