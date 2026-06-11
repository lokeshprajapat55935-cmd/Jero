'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import { LucideIcon } from 'lucide-react';

interface LiveStatCardProps {
  label: string;
  value: string | number;
  subtitle?: string;
  icon: LucideIcon;
  color?: 'violet' | 'emerald' | 'amber' | 'red' | 'blue' | 'cyan';
  pulse?: boolean;
  trend?: { value: number; label: string };
  className?: string;
}

const COLOR_MAP = {
  violet: {
    icon: 'text-violet-400',
    iconBg: 'bg-violet-500/15',
    value: 'text-violet-300',
    badge: 'bg-violet-500/10 border-violet-500/20 text-violet-400',
  },
  emerald: {
    icon: 'text-emerald-400',
    iconBg: 'bg-emerald-500/15',
    value: 'text-emerald-300',
    badge: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400',
  },
  amber: {
    icon: 'text-amber-400',
    iconBg: 'bg-amber-500/15',
    value: 'text-amber-300',
    badge: 'bg-amber-500/10 border-amber-500/20 text-amber-400',
  },
  red: {
    icon: 'text-red-400',
    iconBg: 'bg-red-500/15',
    value: 'text-red-300',
    badge: 'bg-red-500/10 border-red-500/20 text-red-400',
  },
  blue: {
    icon: 'text-blue-400',
    iconBg: 'bg-blue-500/15',
    value: 'text-blue-300',
    badge: 'bg-blue-500/10 border-blue-500/20 text-blue-400',
  },
  cyan: {
    icon: 'text-cyan-400',
    iconBg: 'bg-cyan-500/15',
    value: 'text-cyan-300',
    badge: 'bg-cyan-500/10 border-cyan-500/20 text-cyan-400',
  },
};

export function LiveStatCard({
  label,
  value,
  subtitle,
  icon: Icon,
  color = 'violet',
  pulse = false,
  trend,
  className,
}: LiveStatCardProps) {
  const colors = COLOR_MAP[color];

  return (
    <div
      className={cn(
        'relative rounded-2xl bg-white/4 border border-white/8 p-5 overflow-hidden transition-all hover:bg-white/6 hover:border-white/12',
        className
      )}
    >
      {/* Background glow */}
      <div className={cn('absolute top-0 right-0 h-20 w-20 rounded-full blur-3xl opacity-15', colors.iconBg)} />

      <div className="relative flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-black uppercase tracking-widest text-white/40 mb-2">
            {label}
          </p>
          <p className={cn('text-3xl font-black tracking-tight', colors.value)}>
            {value}
          </p>
          {subtitle && (
            <p className="text-[11px] text-white/30 font-semibold mt-1.5 truncate">{subtitle}</p>
          )}
          {trend && (
            <div
              className={cn(
                'inline-flex items-center gap-1 mt-2 px-2 py-0.5 rounded-full border text-[10px] font-bold',
                colors.badge
              )}
            >
              {trend.value >= 0 ? '↑' : '↓'} {Math.abs(trend.value)}% {trend.label}
            </div>
          )}
        </div>
        <div className={cn('h-10 w-10 rounded-xl flex items-center justify-center shrink-0', colors.iconBg)}>
          <Icon size={18} className={cn(pulse ? 'animate-pulse' : '', colors.icon)} />
        </div>
      </div>
    </div>
  );
}
