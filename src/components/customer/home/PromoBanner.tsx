import React from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, Sparkles } from 'lucide-react';

export function PromoBanner() {
  const router = useRouter();

  return (
    <div className="px-4 py-4">
      <div 
        onClick={() => router.push('/booking/new')}
        className="relative overflow-hidden rounded-[24px] bg-gradient-to-r from-blue-600 to-indigo-700 p-6 shadow-lg shadow-blue-600/20 active:scale-[0.98] transition-transform cursor-pointer"
      >
        {/* Decorative elements */}
        <div className="absolute top-0 right-0 p-4 opacity-10">
          <Sparkles size={100} />
        </div>
        <div className="absolute -bottom-10 -right-10 w-40 h-40 bg-white opacity-10 rounded-full blur-2xl" />

        <div className="relative z-10 flex items-center justify-between">
          <div className="flex flex-col max-w-[70%]">
            <div className="inline-flex items-center gap-1.5 bg-white/20 backdrop-blur-sm px-2.5 py-1 rounded-lg w-max mb-3 border border-white/10">
              <Sparkles size={12} className="text-blue-100" />
              <span className="text-[10px] font-bold text-blue-50 uppercase tracking-widest">Instant</span>
            </div>
            <h3 className="text-xl font-black text-white leading-tight mb-1">
              Book service in<br />30 seconds
            </h3>
            <p className="text-sm font-medium text-blue-100/90">
              Top-rated pros at your door.
            </p>
          </div>

          <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center shadow-md">
            <ArrowRight size={24} className="text-blue-600" />
          </div>
        </div>
      </div>
    </div>
  );
}
