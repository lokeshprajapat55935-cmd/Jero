import React from 'react';
import { useRouter } from 'next/navigation';
import { Star, MapPin, BadgeCheck } from 'lucide-react';
import type { RecommendedWorker } from '@/services/home';

interface RecommendedWorkersProps {
  workers: RecommendedWorker[];
}

export function RecommendedWorkers({ workers }: RecommendedWorkersProps) {
  const router = useRouter();

  if (!workers || workers.length === 0) return null;

  return (
    <div className="py-4">
      <div className="px-4 flex items-center justify-between mb-4">
        <h2 className="text-lg font-black text-gray-900">Recommended for You</h2>
      </div>

      {/* FlatList style horizontal scroll */}
      <div className="flex overflow-x-auto hide-scrollbar px-4 pb-4 gap-4 snap-x">
        {workers.map((worker) => (
          <div 
            key={worker.id}
            onClick={() => router.push(`/worker/${worker.id}`)}
            className="flex-shrink-0 w-64 bg-white border border-gray-100 rounded-[20px] p-4 shadow-sm snap-start active:scale-[0.98] transition-transform cursor-pointer"
          >
            <div className="flex gap-3 mb-3">
              <div className="relative">
                <div className="w-14 h-14 rounded-full bg-gray-100 overflow-hidden border-2 border-white shadow-sm">
                  {worker.avatar_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={worker.avatar_url} alt={worker.name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-400 font-bold text-xl">
                      {worker.name.charAt(0)}
                    </div>
                  )}
                </div>
                <div className="absolute -bottom-1 -right-1 bg-green-500 rounded-full p-0.5 border-2 border-white">
                  <BadgeCheck size={12} className="text-white" />
                </div>
              </div>
              
              <div className="flex flex-col justify-center flex-1 overflow-hidden">
                <h4 className="font-bold text-gray-900 text-sm truncate">{worker.name}</h4>
                <span className="text-[11px] font-semibold text-blue-600 capitalize">{worker.category}</span>
                <div className="flex items-center gap-1 mt-0.5">
                  <Star size={12} className="text-amber-500 fill-amber-500" />
                  <span className="text-xs font-bold text-gray-700">{worker.rating.toFixed(1)}</span>
                  <span className="text-[10px] text-gray-400">({worker.reviews})</span>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-gray-50">
              <div className="flex items-center gap-1 text-gray-500">
                <MapPin size={12} />
                <span className="text-[10px] font-medium truncate max-w-[80px]">{worker.location}</span>
              </div>
              <div className="text-right">
                <span className="text-[10px] text-gray-500 block leading-none mb-0.5">Starts from</span>
                <span className="text-sm font-black text-gray-900 leading-none">₹{worker.price}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
