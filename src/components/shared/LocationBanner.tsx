'use client';

import React from 'react';
import { useCity } from '@/providers/CityProvider';
import { MapPin, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface LocationBannerProps {
  variant?: 'info' | 'warning' | 'success';
  showAlways?: boolean;
  className?: string;
}

/**
 * Component that displays current city availability
 * Shows professional messaging about Bhilwara service
 */
export function LocationBanner({
  variant = 'info',
  showAlways = false,
  className = ''
}: LocationBannerProps) {
  const { activeCity, loading, error } = useCity();

  if (loading) return null;

  const variantStyles = {
    info: 'bg-blue-500/10 text-blue-800 border-blue-200 dark:text-blue-200 dark:border-blue-800',
    warning: 'bg-amber-500/10 text-amber-800 border-amber-200 dark:text-amber-200 dark:border-amber-800',
    success: 'bg-green-500/10 text-green-800 border-green-200 dark:text-green-200 dark:border-green-800',
  };

  const iconColor = {
    info: 'text-blue-600 dark:text-blue-400',
    warning: 'text-amber-600 dark:text-amber-400',
    success: 'text-green-600 dark:text-green-400',
  };

  if (error) {
    return (
      <div className={cn(
        'flex items-center gap-3 p-3 rounded-lg border',
        variantStyles.warning,
        className
      )}>
        <AlertCircle size={16} className={iconColor.warning} />
        <p className="text-sm font-medium">Unable to load service location information.</p>
      </div>
    );
  }

  if (!activeCity) {
    return (
      <div className={cn(
        'flex items-center gap-3 p-3 rounded-lg border',
        variantStyles.warning,
        className
      )}>
        <AlertCircle size={16} className={iconColor.warning} />
        <p className="text-sm font-medium">Service not available in your area.</p>
      </div>
    );
  }

  return (
    <div className={cn(
      'flex items-center gap-3 p-3 rounded-lg border',
      variantStyles[variant],
      className
    )}>
      <MapPin size={16} className={iconColor[variant]} />
      <div className="flex-1">
        <p className="text-sm font-bold">
          ✓ Currently serving <span className="font-extrabold">{activeCity.name}</span>
        </p>
        <p className="text-xs opacity-80 mt-0.5">
          {activeCity.description || `Professional services available in ${activeCity.name}, ${activeCity.state_id}`}
        </p>
      </div>
    </div>
  );
}

/**
 * Compact location badge (for headers, etc.)
 */
export function LocationBadge() {
  const { activeCity, loading } = useCity();

  if (loading || !activeCity) return null;

  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-bold text-muted-foreground shadow-sm">
      <MapPin size={12} className="text-primary" />
      {activeCity.name}
    </div>
  );
}
