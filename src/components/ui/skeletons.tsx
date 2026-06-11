import React from "react";
import { cn } from "@/lib/utils";

// ─── Base Skeleton Block ──────────────────────────────────────────────────────
function SkeletonBlock({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "animate-shimmer rounded-lg bg-muted",
        className
      )}
    />
  );
}

// ─── WorkerCard Skeleton ──────────────────────────────────────────────────────
// Matches the layout of <WorkerCard> — avatar left, 3 text lines right
export function WorkerCardSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex items-center gap-4 p-4 rounded-2xl border border-border bg-card",
        className
      )}
    >
      {/* Avatar */}
      <SkeletonBlock className="h-16 w-16 shrink-0 rounded-xl" />

      {/* Text lines */}
      <div className="flex-1 space-y-2.5">
        <div className="flex items-center justify-between">
          <SkeletonBlock className="h-4 w-28" />
          <SkeletonBlock className="h-4 w-10" />
        </div>
        <SkeletonBlock className="h-3 w-36" />
        <div className="flex items-center justify-between">
          <SkeletonBlock className="h-4 w-16" />
          <SkeletonBlock className="h-3 w-20" />
        </div>
      </div>
    </div>
  );
}

// ─── ServiceCard Skeleton ─────────────────────────────────────────────────────
// Matches the layout of the services grid card
export function ServiceCardSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex flex-col p-6 rounded-2xl border border-border bg-card",
        className
      )}
    >
      <div className="flex justify-between items-start mb-4">
        <SkeletonBlock className="h-10 w-10 rounded-xl" />
        <SkeletonBlock className="h-6 w-16 rounded-md" />
      </div>
      <SkeletonBlock className="h-5 w-3/4 mb-2" />
      <SkeletonBlock className="h-3 w-1/3 mb-4" />
      <SkeletonBlock className="h-3 w-full mb-1" />
      <SkeletonBlock className="h-3 w-5/6 mb-6" />
      <div className="pt-4 border-t border-border/50 flex items-center justify-between">
        <SkeletonBlock className="h-6 w-16" />
        <SkeletonBlock className="h-6 w-12 rounded-md" />
      </div>
    </div>
  );
}

// ─── BookingCard Skeleton ─────────────────────────────────────────────────────
// Matches the layout of booking cards in activity / history pages
export function BookingCardSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex items-center gap-4 p-4 rounded-xl border border-border bg-card",
        className
      )}
    >
      {/* Avatar */}
      <SkeletonBlock className="h-12 w-12 shrink-0 rounded-xl" />

      {/* Text lines */}
      <div className="flex-1 space-y-2">
        <div className="flex items-center justify-between">
          <SkeletonBlock className="h-4 w-28" />
          <SkeletonBlock className="h-5 w-16 rounded-full" />
        </div>
        <SkeletonBlock className="h-3 w-24" />
        <div className="flex items-center justify-between">
          <SkeletonBlock className="h-3 w-20" />
          <SkeletonBlock className="h-3 w-14" />
        </div>
      </div>
    </div>
  );
}

// ─── ProfileFormSkeleton ──────────────────────────────────────────────────────
// Matches the stacked card + input row layout of the worker profile edit page
export function ProfileFormSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("space-y-8 max-w-4xl", className)}>
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <SkeletonBlock className="h-8 w-48" />
          <SkeletonBlock className="h-4 w-64" />
        </div>
        <SkeletonBlock className="h-12 w-36 rounded-xl" />
      </div>

      {/* Card blocks */}
      {[1, 2, 3].map((i) => (
        <div key={i} className="p-8 rounded-2xl border border-border bg-card space-y-5">
          <div className="flex items-center gap-3">
            <SkeletonBlock className="h-10 w-10 rounded-xl" />
            <SkeletonBlock className="h-6 w-40" />
          </div>
          <div className="grid md:grid-cols-2 gap-6">
            <SkeletonBlock className="h-12 rounded-xl" />
            <SkeletonBlock className="h-12 rounded-xl" />
          </div>
          {i === 1 && <SkeletonBlock className="h-28 rounded-xl" />}
        </div>
      ))}
    </div>
  );
}

// ─── WorkerProfile Skeleton ───────────────────────────────────────────────────
// Matches the layout of /worker/[id] — hero image, avatar, name, stats, CTAs
export function WorkerProfileSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("flex flex-col pb-40", className)}>
      {/* Hero banner */}
      <SkeletonBlock className="h-52 w-full rounded-none" />

      {/* Avatar + name row */}
      <div className="px-5 -mt-12 flex items-end gap-4 mb-5">
        <SkeletonBlock className="h-24 w-24 rounded-2xl ring-4 ring-background shrink-0" />
        <div className="mb-2 flex-1 space-y-2">
          <SkeletonBlock className="h-6 w-40" />
          <SkeletonBlock className="h-4 w-28" />
        </div>
      </div>

      {/* Stats row */}
      <div className="px-5 grid grid-cols-3 gap-3 mb-6">
        {[1, 2, 3].map((i) => (
          <div key={i} className="rounded-2xl border border-border bg-card p-4 space-y-2">
            <SkeletonBlock className="h-6 w-12 mx-auto" />
            <SkeletonBlock className="h-3 w-16 mx-auto" />
          </div>
        ))}
      </div>

      {/* About block */}
      <div className="px-5 mb-6 space-y-2">
        <SkeletonBlock className="h-4 w-24" />
        <SkeletonBlock className="h-3 w-full" />
        <SkeletonBlock className="h-3 w-5/6" />
        <SkeletonBlock className="h-3 w-4/6" />
      </div>

      {/* Skills row */}
      <div className="px-5 mb-6 flex gap-2">
        {[1, 2, 3].map((i) => (
          <SkeletonBlock key={i} className="h-7 w-20 rounded-full" />
        ))}
      </div>

      {/* CTA buttons */}
      <div className="fixed bottom-0 left-0 right-0 px-5 pb-8 pt-4 bg-background/80 backdrop-blur flex gap-3">
        <SkeletonBlock className="h-14 flex-1 rounded-2xl" />
        <SkeletonBlock className="h-14 w-14 rounded-2xl" />
      </div>
    </div>
  );
}
