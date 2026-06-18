"use client";

import React, { useState } from 'react';
import { Search, SlidersHorizontal } from 'lucide-react';
import { SearchOverlay } from '@/components/search/SearchOverlay';
import { ComingSoonModal } from './ComingSoonModal';
import { useRouter } from 'next/navigation';

export function HomeSearchBar() {
  const router = useRouter();
  const [isOverlayOpen, setIsOverlayOpen] = useState(false);
  const [comingSoonService, setComingSoonService] = useState<string | null>(null);

  const pills = [
    { label: 'Electrician', emoji: '⚡', action: () => router.push('/services/electrician') },
    { label: 'Plumber', emoji: '🔧', action: () => router.push('/services/plumber') },
    { label: 'AC Repair', emoji: '❄️', action: () => setComingSoonService('AC Repair') },
    { label: 'Carpenter', emoji: '🔨', action: () => setComingSoonService('Carpenter') },
  ];

  return (
    <>
      <div className="px-4 py-2 mt-3 mb-2">
        {/* Large Premium Search Bar Container */}
        <div className="flex gap-2">
          <div 
            onClick={() => setIsOverlayOpen(true)}
            className="flex-1 bg-gray-50 border border-gray-100 hover:bg-white hover:border-gray-200 rounded-2xl p-4 flex items-center gap-3 cursor-text shadow-sm transition-all"
          >
            <Search size={20} className="text-gray-400" />
            <div className="flex flex-col flex-1">
              <span className="text-sm font-black text-gray-800 tracking-tight leading-none mb-1">
                What service do you need today?
              </span>
              <span className="text-[11px] font-bold text-gray-400 truncate leading-none">
                Search for electrician, plumber, AC repair...
              </span>
            </div>
          </div>
          
          {/* Settings/Filter button for visual flair */}
          <button 
            onClick={() => setIsOverlayOpen(true)}
            className="w-14 h-14 bg-gray-50 border border-gray-100 hover:bg-white hover:border-gray-200 rounded-2xl flex items-center justify-center text-gray-600 shadow-sm active:scale-95 transition-all"
          >
            <SlidersHorizontal size={18} />
          </button>
        </div>

        {/* Quick Search Pills */}
        <div className="flex items-center gap-2 mt-3 overflow-x-auto no-scrollbar py-0.5">
          <span className="text-[10px] font-extrabold text-gray-400 uppercase tracking-wider whitespace-nowrap mr-1">
            Try:
          </span>
          {pills.map((pill, idx) => (
            <button
              key={idx}
              onClick={pill.action}
              className="flex items-center gap-1 px-3 py-1.5 rounded-xl border border-gray-100 bg-white hover:bg-gray-50 shadow-sm text-xs font-bold text-gray-700 whitespace-nowrap active:scale-95 transition-all"
            >
              <span>{pill.emoji}</span>
              <span>{pill.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Search Overlay */}
      <SearchOverlay 
        isOpen={isOverlayOpen} 
        onClose={() => setIsOverlayOpen(false)} 
      />

      {/* Coming Soon Modal */}
      <ComingSoonModal 
        isOpen={comingSoonService !== null} 
        onClose={() => setComingSoonService(null)} 
        serviceName={comingSoonService || ''} 
      />
    </>
  );
}

