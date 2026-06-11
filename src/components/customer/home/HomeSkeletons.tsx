import React from 'react';

export function CategoryGridSkeleton() {
  return (
    <div className="px-4 py-4 animate-pulse">
      <div className="flex items-center justify-between mb-4">
        <div className="h-6 w-24 bg-gray-200 rounded-md"></div>
        <div className="h-4 w-12 bg-gray-200 rounded-md"></div>
      </div>
      <div className="grid grid-cols-4 gap-y-6 gap-x-2">
        {[...Array(8)].map((_, i) => (
          <div key={i} className="flex flex-col items-center gap-2">
            <div className="w-16 h-16 rounded-2xl bg-gray-200"></div>
            <div className="w-12 h-3 bg-gray-200 rounded-full"></div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function RecommendedWorkersSkeleton() {
  return (
    <div className="py-4 animate-pulse">
      <div className="px-4 mb-4">
        <div className="h-6 w-48 bg-gray-200 rounded-md"></div>
      </div>
      <div className="flex overflow-x-hidden px-4 gap-4">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="flex-shrink-0 w-64 bg-white border border-gray-100 rounded-[20px] p-4 shadow-sm">
            <div className="flex gap-3 mb-3">
              <div className="w-14 h-14 rounded-full bg-gray-200"></div>
              <div className="flex flex-col justify-center flex-1 gap-2">
                <div className="h-4 w-24 bg-gray-200 rounded-md"></div>
                <div className="h-3 w-16 bg-gray-200 rounded-md"></div>
              </div>
            </div>
            <div className="pt-3 border-t border-gray-50 flex justify-between">
              <div className="h-3 w-16 bg-gray-200 rounded-md"></div>
              <div className="h-4 w-12 bg-gray-200 rounded-md"></div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
