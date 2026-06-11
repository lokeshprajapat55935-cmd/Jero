import React from 'react';
import { useRouter } from 'next/navigation';
import type { ServiceCategory } from '@/types';
import { Settings, Droplet, Zap, Wrench, Shield, Home, Wind, Hammer, Brush, Filter } from 'lucide-react';

interface CategoryGridProps {
  categories: ServiceCategory[];
}

// Fallback icon mapper for predefined categories
const iconMap: Record<string, React.ReactNode> = {
  electrician: <Zap size={28} className="text-amber-500" />,
  plumber: <Droplet size={28} className="text-cyan-600" />,
  default: <Shield size={28} className="text-gray-600" />,
};

export function CategoryGrid({ categories }: CategoryGridProps) {
  const router = useRouter();

  return (
    <div className="px-4 py-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-black text-gray-900">Services</h2>
        <button 
          onClick={() => router.push('/search')}
          className="text-sm font-bold text-blue-600 active:scale-95 transition-transform"
        >
          See All
        </button>
      </div>

      <div className="grid grid-cols-4 gap-y-6 gap-x-2">
        {categories.map((cat) => (
          <div 
            key={cat.id} 
            onClick={() => router.push(`/services/${cat.id}`)}
            className="flex flex-col items-center gap-2 cursor-pointer group active:scale-95 transition-transform"
          >
            <div className="w-16 h-16 rounded-2xl bg-gray-50 border border-gray-100 flex items-center justify-center shadow-sm group-hover:bg-blue-50 transition-colors">
              {cat.icon && cat.icon.includes('/') ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={cat.icon} alt={cat.name} className="w-8 h-8 object-contain" />
              ) : (
                iconMap[cat.id] || iconMap[cat.slug] || iconMap.default
              )}
            </div>
            <span className="text-[11px] font-extrabold text-center text-gray-700 leading-tight">
              {cat.name}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
