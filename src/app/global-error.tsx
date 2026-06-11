'use client';

import React from 'react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  React.useEffect(() => {
    // Log error to console or error reporting service
    console.error('CRITICAL: Root Layout Crash Caught by Global Error Boundary:', error);
  }, [error]);

  return (
    <html lang="en">
      <body className="min-h-screen bg-zinc-950 text-zinc-50 font-sans antialiased flex flex-col items-center justify-center p-6 text-center">
        <div className="mb-6 rounded-full bg-red-500/20 p-5 text-red-500 ring-1 ring-red-500/30">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="48"
            height="48"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        </div>
        <h1 className="mb-3 text-3xl font-extrabold tracking-tight">Critical Application Error</h1>
        <p className="mb-8 text-zinc-400 max-w-md text-sm leading-relaxed">
          A fatal error occurred while rendering the core application layout. We&apos;ve captured the issue and our team is on it.
        </p>
        <div className="flex gap-4">
          <button
            onClick={() => window.location.href = '/'}
            className="rounded-xl bg-zinc-800 px-6 py-3 text-sm font-semibold text-white shadow-sm hover:bg-zinc-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-600 transition-all"
          >
            Return to Home
          </button>
          <button
            onClick={() => reset()}
            className="rounded-xl bg-emerald-600 px-6 py-3 text-sm font-semibold text-white shadow-sm hover:bg-emerald-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 transition-all flex items-center gap-2"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
            Retry Request
          </button>
        </div>
      </body>
    </html>
  );
}
