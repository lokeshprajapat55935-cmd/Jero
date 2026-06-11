'use client';

import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class SafeErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('SafeErrorBoundary caught an error:', error, errorInfo);
    
    // Dynamic import to prevent initial bundle bloat
    import('@/lib/error-monitor').then(({ errorMonitor }) => {
      errorMonitor.capture(error, {
        eventType: 'ui_render_error',
        severity: 'medium',
        metadata: { errorInfo }
      });
    }).catch(err => {
      console.error('Failed to load error-monitor in ErrorBoundary:', err);
    });
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      const isChunkError = this.state.error?.name === 'ChunkLoadError' || 
                            this.state.error?.message?.includes('Loading chunk');

      return (
        <div className="flex min-h-[50vh] w-full flex-col items-center justify-center space-y-4 p-8 text-center bg-gray-50/50 rounded-2xl border border-gray-100">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-100">
            <AlertTriangle className="h-8 w-8 text-red-600" />
          </div>
          <div className="space-y-2">
            <h3 className="text-xl font-semibold tracking-tight">
              {isChunkError ? "App Update Available" : "Something went wrong"}
            </h3>
            <p className="text-sm text-gray-500 max-w-sm mx-auto">
              {isChunkError 
                ? "A new version of the app is available. Please reload the page to load the latest features."
                : "A temporary issue caused this section to fail. Don't worry, your data is safe."}
            </p>
          </div>
          <Button
            onClick={() => isChunkError ? window.location.reload() : this.handleReset()}
            variant="outline"
            className="mt-4 gap-2"
          >
            <RefreshCcw className="h-4 w-4" />
            {isChunkError ? "Reload Page" : "Try Again"}
          </Button>
        </div>
      );
    }

    return this.props.children;
  }
}
