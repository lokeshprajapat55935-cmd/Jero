import React from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, ShieldCheck, Zap, DollarSign } from 'lucide-react';

export function PromoBanner() {
  const router = useRouter();

  return (
    <div className="px-4 py-3">
      <div 
        onClick={() => router.push('/booking/new')}
        className="relative overflow-hidden rounded-[28px] bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 p-6 shadow-xl border border-white/5 active:scale-[0.99] transition-transform cursor-pointer"
      >
        {/* Glow effect */}
        <div className="absolute top-0 right-0 w-48 h-48 bg-indigo-500/10 rounded-full blur-[64px]" />
        <div className="absolute -bottom-10 -left-10 w-48 h-48 bg-blue-500/10 rounded-full blur-[64px]" />

        <div className="relative z-10">
          {/* Logo / Branding */}
          <div className="inline-flex items-center gap-1 bg-white/10 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/10 mb-4">
            <span className="text-yellow-400 font-extrabold text-sm leading-none animate-pulse">⚡</span>
            <span className="text-xs font-black text-white tracking-widest leading-none">JERO</span>
          </div>

          {/* Headline */}
          <h3 className="text-2xl font-black text-white leading-tight mb-4 tracking-tight max-w-[85%]">
            Home Services At Your Doorstep
          </h3>

          {/* Features */}
          <div className="space-y-2 mb-6">
            <div className="flex items-center gap-2 text-gray-300">
              <ShieldCheck size={14} className="text-emerald-400 flex-shrink-0" />
              <span className="text-xs font-bold">Verified Workers</span>
            </div>
            <div className="flex items-center gap-2 text-gray-300">
              <Zap size={14} className="text-amber-400 flex-shrink-0" />
              <span className="text-xs font-bold">Fast Booking</span>
            </div>
            <div className="flex items-center gap-2 text-gray-300">
              <DollarSign size={14} className="text-blue-400 flex-shrink-0" />
              <span className="text-xs font-bold">Transparent Pricing</span>
            </div>
          </div>

          {/* CTA Button */}
          <div className="flex items-center justify-between mt-4">
            <div className="inline-flex items-center gap-2 px-5 py-3 rounded-2xl bg-white text-slate-900 hover:bg-gray-50 active:scale-95 transition-all shadow-md">
              <span className="text-xs font-black tracking-wide">Book Now</span>
              <ArrowRight size={14} className="stroke-[3]" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

