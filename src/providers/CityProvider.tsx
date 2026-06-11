'use client';

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { resolveActiveCity } from '@/lib/data/cities';
import type { City, Area } from '@/types/location';
import { getPlatformConfig } from '@/lib/data/platform_config';
import logger from '@/lib/logger';

interface CityContextType {
  activeCity: City | null;
  activeCitySlug: string;
  areas: Area[];
  mode: 'single' | 'multi';
  loading: boolean;
  error: string | null;
  refreshCity: () => Promise<void>;
}

const CityContext = createContext<CityContextType | undefined>(undefined);

// Module-level cache — persists across React re-mounts within the same session.
// This prevents 4 API calls on every page navigation.
let _cachedCity: City | null = null;
let _cachedSlug: string = '';
let _cachedAreas: Area[] = [];
let _cachedMode: 'single' | 'multi' = 'single';
let _cacheReady = false;

export function CityProvider({ children }: { children: React.ReactNode }) {
  const fallback = resolveActiveCity();
  const fallbackSlug = getPlatformConfig().active_city_slug;

  const [activeCity, setActiveCity] = useState<City | null>(_cacheReady ? _cachedCity : null);
  const [activeCitySlug, setActiveCitySlug] = useState(_cacheReady ? _cachedSlug : '');
  const [areas, setAreas] = useState<Area[]>(_cacheReady ? _cachedAreas : []);
  const [mode, setMode] = useState<'single' | 'multi'>(_cacheReady ? _cachedMode : 'single');
  const [loading, setLoading] = useState(!_cacheReady);
  const [error, setError] = useState<string | null>(null);

  const refreshCity = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/location/active');
      if (!response.ok) {
        throw new Error('Failed to fetch active city configuration');
      }
      
      const result = await response.json();
      if (!result.success) {
        throw new Error(result.error || 'Failed to load active city data');
      }

      const { activeCity: city, activeCitySlug: citySlug, mode: platformMode, areas: cityAreas } = result.data;

      const resolvedCity = city ?? fallback;
      const resolvedSlug = city?.slug ?? citySlug ?? fallbackSlug;

      // Update module-level cache
      _cachedCity = resolvedCity;
      _cachedSlug = resolvedSlug;
      _cachedAreas = cityAreas;
      _cachedMode = platformMode;
      _cacheReady = true;

      setActiveCity(resolvedCity);
      setActiveCitySlug(resolvedSlug);
      setMode(platformMode);
      setAreas(cityAreas);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load city data';
      setError(message);
      logger.error('CityProvider error', err);
      setActiveCity(fallback);
      setActiveCitySlug(fallbackSlug);
      setMode(getPlatformConfig().active_city_mode);
      setAreas([]);
    } finally {
      setLoading(false);
    }
  }, [fallback, fallbackSlug]);

  useEffect(() => {
    // If cache is warm, skip the API calls entirely
    if (_cacheReady) return;
    refreshCity();
  }, [refreshCity]);

  const value = React.useMemo(() => ({
    activeCity,
    activeCitySlug,
    areas,
    mode,
    loading,
    error,
    refreshCity,
  }), [activeCity, activeCitySlug, areas, mode, loading, error, refreshCity]);

  return (
    <CityContext.Provider value={value}>
      {children}
    </CityContext.Provider>
  );
}

/**
 * Hook to use city context
 */
export function useCity() {
  const context = useContext(CityContext);
  if (!context) {
    throw new Error('useCity must be used within CityProvider');
  }
  return context;
}
