"use client";

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Zap, Droplet, Wrench, Sparkles, Tv } from 'lucide-react';
import { ComingSoonModal } from './ComingSoonModal';

export function TopCategories() {
  const router = useRouter();
  const [comingSoonService, setComingSoonService] = useState<string | null>(null);

  const categories = [
    {
      id: 'electrician',
      name: 'Electrical',
      tagline: 'Switches, wiring & installations',
      icon: <Zap size={20} className="text-amber-600" />,
      gradient: 'from-amber-500/10 to-amber-500/0 hover:from-amber-500/15',
      border: 'border-amber-100',
      action: () => router.push('/services/electrician'),
    },
    {
      id: 'plumber',
      name: 'Plumbing',
      tagline: 'Taps, pipes & leak repair',
      icon: <Droplet size={20} className="text-blue-600" />,
      gradient: 'from-blue-500/10 to-blue-500/0 hover:from-blue-500/15',
      border: 'border-blue-100',
      action: () => router.push('/services/plumber'),
    },
    {
      id: 'home-repair',
      name: 'Home Repair',
      tagline: 'Carpentry, mounting & fixes',
      icon: <Wrench size={20} className="text-orange-600" />,
      gradient: 'from-orange-500/10 to-orange-500/0 hover:from-orange-500/15',
      border: 'border-orange-100',
      action: () => setComingSoonService('Home Repair'),
    },
    {
      id: 'cleaning',
      name: 'Cleaning',
      tagline: 'Deep cleaning & sanitation',
      icon: <Sparkles size={20} className="text-emerald-600" />,
      gradient: 'from-emerald-500/10 to-emerald-500/0 hover:from-emerald-500/15',
      border: 'border-emerald-100',
      action: () => setComingSoonService('Cleaning Services'),
    },
    {
      id: 'appliances',
      name: 'Appliances',
      tagline: 'AC, fridge & TV service',
      icon: <Tv size={20} className="text-indigo-600" />,
      gradient: 'from-indigo-500/10 to-indigo-500/0 hover:from-indigo-500/15',
      border: 'border-indigo-100',
      action: () => setComingSoonService('Appliance Repair'),
    },
  ];

  return (
    <>
      <div className="py-4">
        <div className="px-4 mb-4">
          <h2 className="text-lg font-black text-gray-900">Top Categories</h2>
          <p className="text-xs font-semibold text-gray-400 mt-0.5">Explore our range of quality home services</p>
        </div>

        {/* Horizontal scroll list of cards */}
        <div className="flex overflow-x-auto no-scrollbar px-4 pb-2 gap-4 snap-x">
          {categories.map((cat, idx) => (
            <div
              key={idx}
              onClick={cat.action}
              className={`flex-shrink-0 w-64 bg-gradient-to-br ${cat.gradient} border ${cat.border} rounded-[24px] p-4 snap-start active:scale-[0.98] transition-all cursor-pointer flex items-start gap-3 shadow-sm`}
            >
              <div className="p-2.5 rounded-xl bg-white shadow-sm flex-shrink-0">
                {cat.icon}
              </div>
              <div className="flex flex-col overflow-hidden">
                <h3 className="font-extrabold text-gray-900 text-sm leading-tight mb-0.5">
                  {cat.name}
                </h3>
                <p className="text-[11px] font-bold text-gray-500 leading-snug">
                  {cat.tagline}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Coming soon popup sheet */}
      <ComingSoonModal
        isOpen={comingSoonService !== null}
        onClose={() => setComingSoonService(null)}
        serviceName={comingSoonService || ''}
      />
    </>
  );
}
