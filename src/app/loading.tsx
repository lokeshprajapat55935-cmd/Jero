import React from "react";

export default function Loading() {
  return (
    <div className="app-shell py-8 flex flex-col gap-6 animate-in fade-in duration-300">
      {/* Dynamic, neutral premium page transition skeletons */}
      <div className="flex flex-col gap-3">
        <div className="h-8 w-48 rounded-xl bg-muted animate-shimmer" />
        <div className="h-4 w-96 rounded-lg bg-muted animate-shimmer" />
      </div>
      
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 mt-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-32 rounded-2xl border border-border/60 bg-card p-5 space-y-4 shadow-sm">
            <div className="h-10 w-10 rounded-xl bg-muted animate-shimmer" />
            <div className="space-y-2">
              <div className="h-4 w-28 rounded bg-muted animate-shimmer" />
              <div className="h-3 w-40 rounded bg-muted animate-shimmer" />
            </div>
          </div>
        ))}
      </div>
      
      <div className="h-48 w-full rounded-2xl border border-border/60 bg-card p-5 mt-4 space-y-4 shadow-sm">
        <div className="h-4 w-32 rounded bg-muted animate-shimmer" />
        <div className="h-3 w-full rounded bg-muted animate-shimmer" />
        <div className="h-3 w-5/6 rounded bg-muted animate-shimmer" />
        <div className="h-3 w-4/6 rounded bg-muted animate-shimmer" />
      </div>
    </div>
  );
}
