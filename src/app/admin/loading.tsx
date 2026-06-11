import React from 'react';

export default function AdminLoading() {
  return (
    <div className="flex h-screen w-full flex-col bg-zinc-50 dark:bg-zinc-950 p-6 animate-pulse">
      <div className="mb-8 flex items-center justify-between">
        <div className="h-8 w-48 rounded-lg bg-zinc-200 dark:bg-zinc-800" />
        <div className="h-10 w-10 rounded-full bg-zinc-200 dark:bg-zinc-800" />
      </div>
      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-32 rounded-xl bg-zinc-200 dark:bg-zinc-800" />
        ))}
      </div>
      <div className="mt-8 flex-1 w-full rounded-xl bg-zinc-200/50 dark:bg-zinc-800/50" />
    </div>
  );
}
