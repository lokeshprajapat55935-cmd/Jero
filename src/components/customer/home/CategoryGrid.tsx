"use client";

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ServiceCategory } from '@/types';
import { Zap, Droplet, Hammer, Brush, Wind, Filter, Tv, Sparkles, Shield } from 'lucide-react';
import { ComingSoonModal } from './ComingSoonModal';

interface CategoryGridProps {
  categories: ServiceCategory[];
}

interface PopularServiceItem {
  id: string;
  name: string;
  icon: React.ReactNode;
  bgClass: string;
}

export function CategoryGrid({ categories }: CategoryGridProps) {
  const router = useRouter();
  const [comingSoonService, setComingSoonService] = useState<string | null>(null);

  // Static definition of requested popular services with modern icons and curated backgrounds
  const popularServices: PopularServiceItem[] = [
    { 
      id: 'electrician', 
      name: 'Electrician', 
      icon: <Zap size={26} className="text-amber-500" />,
      bgClass: 'bg-amber-50 hover:bg-amber-100/70 border-amber-100/50'
    },
    { 
      id: 'plumber', 
      name: 'Plumber', 
      icon: <Droplet size={26} className="text-blue-500" />,
      bgClass: 'bg-blue-50 hover:bg-blue-100/70 border-blue-100/50'
    },
    { 
      id: 'carpenter', 
      name: 'Carpenter', 
      icon: <Hammer size={26} className="text-orange-500" />,
      bgClass: 'bg-orange-50/50 hover:bg-orange-100/50 border-orange-100/30'
    },
    { 
      id: 'painter', 
      name: 'Painter', 
      icon: <Brush size={26} className="text-rose-500" />,
      bgClass: 'bg-rose-50/50 hover:bg-rose-100/50 border-rose-100/30'
    },
    { 
      id: 'ac-repair', 
      name: 'AC Repair', 
      icon: <Wind size={26} className="text-cyan-500" />,
      bgClass: 'bg-cyan-50/50 hover:bg-cyan-100/50 border-cyan-100/30'
    },
    { 
      id: 'ro-service', 
      name: 'RO Service', 
      icon: <Filter size={26} className="text-teal-500" />,
      bgClass: 'bg-teal-50/50 hover:bg-teal-100/50 border-teal-100/30'
    },
    { 
      id: 'appliance-repair', 
      name: 'Appliance Repair', 
      icon: <Tv size={26} className="text-indigo-500" />,
      bgClass: 'bg-indigo-50/50 hover:bg-indigo-100/50 border-indigo-100/30'
    },
    { 
      id: 'cleaning', 
      name: 'Cleaning', 
      icon: <Sparkles size={26} className="text-emerald-500" />,
      bgClass: 'bg-emerald-50/50 hover:bg-emerald-100/50 border-emerald-100/30'
    },
  ];

  // Identify categories returned from database that are not covered by our 8 popular services
  const dbOnlyCategories = categories.filter(dbCat => 
    !popularServices.some(p => p.id === dbCat.id.toLowerCase() || p.id === dbCat.slug.toLowerCase())
  );

  // Total count of distinct services
  const totalCount = popularServices.length + dbOnlyCategories.length;

  // Handle service clicks
  const handleServiceClick = (serviceId: string, name: string) => {
    // Check if the service exists in the active database categories list
    const isActiveInDb = categories.some(c => c.id.toLowerCase() === serviceId || c.slug.toLowerCase() === serviceId);
    
    if (isActiveInDb) {
      router.push(`/services/${serviceId}`);
    } else {
      setComingSoonService(name);
    }
  };

  return (
    <>
      <div className="px-4 py-3">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-black text-gray-900">Popular Services</h2>
            <p className="text-xs font-semibold text-gray-400 mt-0.5">Professional help in seconds</p>
          </div>
          {totalCount > 8 && (
            <button 
              onClick={() => router.push('/search')}
              className="text-xs font-black text-blue-600 active:scale-95 transition-transform bg-blue-50 px-3 py-1.5 rounded-xl border border-blue-100/40"
            >
              See All
            </button>
          )}
        </div>

        {/* 4-column modern grid */}
        <div className="grid grid-cols-4 gap-y-5 gap-x-3">
          {/* Render static popular services first */}
          {popularServices.map((svc) => (
            <div 
              key={svc.id} 
              onClick={() => handleServiceClick(svc.id, svc.name)}
              className="flex flex-col items-center gap-1.5 cursor-pointer group active:scale-95 transition-transform"
            >
              <div className={`w-16 h-16 rounded-[22px] border flex items-center justify-center shadow-sm transition-all duration-200 ${svc.bgClass}`}>
                {svc.icon}
              </div>
              <span className="text-[11px] font-extrabold text-center text-gray-700 leading-tight">
                {svc.name}
              </span>
            </div>
          ))}

          {/* Render other database categories dynamically if any exist */}
          {dbOnlyCategories.map((cat) => (
            <div 
              key={cat.id} 
              onClick={() => router.push(`/services/${cat.id}`)}
              className="flex flex-col items-center gap-1.5 cursor-pointer group active:scale-95 transition-transform"
            >
              <div className="w-16 h-16 rounded-[22px] bg-gray-50 border border-gray-100 flex items-center justify-center shadow-sm group-hover:bg-blue-50 transition-all">
                <Shield size={26} className="text-gray-400" />
              </div>
              <span className="text-[11px] font-extrabold text-center text-gray-700 leading-tight">
                {cat.name}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Coming Soon bottom sheet */}
      <ComingSoonModal 
        isOpen={comingSoonService !== null}
        onClose={() => setComingSoonService(null)}
        serviceName={comingSoonService || ''}
      />
    </>
  );
}

