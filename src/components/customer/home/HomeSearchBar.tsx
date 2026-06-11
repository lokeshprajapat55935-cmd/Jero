"use client";

import React, { useState } from 'react';
import { Search } from 'lucide-react';
import { SearchOverlay } from '@/components/search/SearchOverlay';

export function HomeSearchBar() {
  const [isOverlayOpen, setIsOverlayOpen] = useState(false);

  return (
    <>
      <div className="px-4 py-2 mb-2 mt-2">
        <div 
          onClick={() => setIsOverlayOpen(true)}
          className="w-full bg-gray-50 border border-gray-200 rounded-2xl p-4 flex items-center gap-3 cursor-text shadow-sm active:scale-[0.98] transition-transform"
        >
          <Search size={20} className="text-gray-400" />
          <div className="flex flex-col flex-1">
            <span className="text-sm font-bold text-gray-800">What service do you need?</span>
            <span className="text-xs font-medium text-gray-500 truncate">Search for plumbers, electricians...</span>
          </div>
        </div>
      </div>

      <SearchOverlay 
        isOpen={isOverlayOpen} 
        onClose={() => setIsOverlayOpen(false)} 
      />
    </>
  );
}
