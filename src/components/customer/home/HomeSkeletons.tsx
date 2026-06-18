import React from 'react';

export function BannerSkeleton() {
  return (
    <div className="px-4 py-3">
      <div className="w-full h-[180px] rounded-[28px] animate-shimmer relative overflow-hidden border border-gray-100" />
    </div>
  );
}

export function CategoryGridSkeleton() {
  return (
    <div className="px-4 py-3">
      <div className="flex items-center justify-between mb-4">
        <div className="flex flex-col gap-1.5">
          <div className="h-5 w-32 animate-shimmer rounded-md"></div>
          <div className="h-3 w-40 animate-shimmer rounded-md"></div>
        </div>
      </div>
      
      <div className="grid grid-cols-4 gap-y-5 gap-x-3">
        {[...Array(8)].map((_, i) => (
          <div key={i} className="flex flex-col items-center gap-2">
            <div className="w-16 h-16 rounded-[22px] animate-shimmer border border-gray-100"></div>
            <div className="w-12 h-3.5 animate-shimmer rounded-md"></div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function RecommendedWorkersSkeleton() {
  return (
    <div className="py-4">
      <div className="px-4 mb-4">
        <div className="h-5 w-40 animate-shimmer rounded-md mb-1.5"></div>
        <div className="h-3.5 w-48 animate-shimmer rounded-md"></div>
      </div>
      <div className="flex overflow-x-hidden px-4 gap-4">
        {[...Array(2)].map((_, i) => (
          <div key={i} className="flex-shrink-0 w-64 bg-white border border-gray-100 rounded-[24px] p-4 shadow-sm flex flex-col justify-between h-[160px]">
            <div>
              <div className="flex gap-3 mb-3">
                <div className="w-14 h-14 rounded-full animate-shimmer border border-gray-100"></div>
                <div className="flex flex-col justify-center flex-1 gap-2">
                  <div className="h-4 w-28 animate-shimmer rounded-md"></div>
                  <div className="h-3 w-16 animate-shimmer rounded-md"></div>
                  <div className="h-3.5 w-12 animate-shimmer rounded-md"></div>
                </div>
              </div>
            </div>
            <div className="pt-3 border-t border-gray-50 flex justify-between items-center">
              <div className="h-3 w-16 animate-shimmer rounded-md"></div>
              <div className="h-4 w-12 animate-shimmer rounded-md"></div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

