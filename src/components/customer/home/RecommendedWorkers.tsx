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
        <div>
          <h2 className="text-lg font-black text-gray-900">Recommended for You</h2>
          <p className="text-xs font-semibold text-gray-400 mt-0.5">Top-rated local experts near you</p>
        </div>
      </div>

      {/* Horizontal scroll */}
      <div className="flex overflow-x-auto no-scrollbar px-4 pb-4 gap-4 snap-x">
        {workers.map((worker) => {
          // Format experience display
          const experienceText = worker.experience > 0 
            ? `${worker.experience} yrs exp` 
            : 'Verified Pro';

          return (
            <div 
              key={worker.id}
              onClick={() => router.push(`/worker/${worker.id}`)}
              className="flex-shrink-0 w-64 bg-white border border-gray-100 rounded-[24px] p-4 shadow-sm snap-start active:scale-[0.98] transition-transform cursor-pointer flex flex-col justify-between"
            >
              <div>
                <div className="flex gap-3 mb-3">
                  <div className="relative flex-shrink-0">
                    <div className="w-14 h-14 rounded-full bg-gray-50 overflow-hidden border border-gray-100 flex items-center justify-center">
                      {worker.avatar_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={worker.avatar_url} alt={worker.name} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-blue-50 text-blue-600 font-bold text-lg">
                          {worker.name.charAt(0)}
                        </div>
                      )}
                    </div>
                    <div className="absolute -bottom-0.5 -right-0.5 bg-emerald-500 rounded-full p-0.5 border-2 border-white">
                      <BadgeCheck size={12} className="text-white" />
                    </div>
                  </div>
                  
                  <div className="flex flex-col justify-center flex-1 overflow-hidden">
                    <h4 className="font-extrabold text-gray-900 text-sm truncate flex items-center gap-1">
                      {worker.name}
                    </h4>
                    <span className="text-[10px] font-extrabold text-blue-600 uppercase tracking-wider">{worker.category}</span>
                    
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <Star size={12} className="text-amber-500 fill-amber-500" />
                      <span className="text-xs font-black text-gray-700">{worker.rating.toFixed(1)}</span>
                      <span className="text-[10px] font-bold text-gray-400">({worker.reviews})</span>
                    </div>
                  </div>
                </div>

                {/* Sub details: Experience and City */}
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-[10px] font-bold text-gray-500 bg-gray-50 px-2 py-0.5 rounded-md border border-gray-100/50">
                    {experienceText}
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-between pt-3 border-t border-gray-50 mt-1">
                <div className="flex items-center gap-1 text-gray-400">
                  <MapPin size={12} className="text-gray-400" />
                  <span className="text-[10px] font-bold text-gray-500 truncate max-w-[90px]">{worker.location}</span>
                </div>
                <div className="text-right">
                  <span className="text-[9px] font-bold text-gray-400 block leading-none mb-0.5 uppercase tracking-wider">Starts from</span>
                  <span className="text-sm font-black text-gray-900 leading-none">₹{worker.price}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

