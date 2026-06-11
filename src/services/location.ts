import { getSupabaseClient } from '@/lib/supabase/resolveClient';
import {
  cities,
  DEFAULT_CITY_SLUG,
  getDefaultCity,
  resolveCityFromSlug,
  resolveActiveCity,
} from '@/lib/data/cities';
import { getPlatformConfig, DEFAULT_ACTIVE_CITY_SLUG } from '@/lib/data/platform_config';
import type { City, Area, PlatformConfig } from '@/types/location';
import logger from '@/lib/logger';

export type { City, Area, PlatformConfig };

const FALLBACK_CITY: City = getDefaultCity();

// Server-side cache store (only applicable when running in Node.js server)
interface LocationCache {
  activeCitySlug?: { data: string; timestamp: number };
  activeCity?: Record<string, { data: City; timestamp: number }>;
  platformMode?: { data: 'single' | 'multi'; timestamp: number };
  areasForCity?: Record<string, { data: Area[]; timestamp: number }>;
  cityBySlug?: Record<string, { data: City | null; timestamp: number }>;
  areaBySlug?: Record<string, { data: Area | null; timestamp: number }>;
}

const serverCache: LocationCache = {
  activeCity: {},
  areasForCity: {},
  cityBySlug: {},
  areaBySlug: {},
};

const SERVER_CACHE_TTL = 60 * 1000; // 60 seconds

function isCacheValid(item: { timestamp: number } | undefined): boolean {
  if (!item) return false;
  return Date.now() - item.timestamp < SERVER_CACHE_TTL;
}

function describeSupabaseError(error: unknown) {
  if (!error || typeof error !== 'object') return String(error || 'Unknown error');

  const value = error as { message?: string; code?: string; details?: string; hint?: string };
  return [value.message, value.code, value.details, value.hint].filter(Boolean).join(' | ') || 'Unknown database error';
}

/**
 * standalone exported helpers matching original cityResolver.ts exports
 */
export function getAvailableCities(): City[] {
  const config = getPlatformConfig();
  const active = cities.filter((c) => c.is_active);

  if (config.active_city_mode === 'single') {
    return [resolveCityFromSlug(config.active_city_slug)];
  }

  return active.length > 0 ? active : [getDefaultCity()];
}

// resolveActiveCity is imported from cities data helper

/** DB-backed active city with static Bhilwara fallback; never throws. */
export async function getActiveCity(citySlug?: string): Promise<City> {
  try {
    return await locationService.getActiveCity(citySlug);
  } catch (error) {
    logger.warn('getActiveCity failed, using static fallback:', error);
    return resolveActiveCity(citySlug);
  }
}

/**
 * Centralized location/geo service
 * Handles all city, area, and location validation
 * Single source of truth for location logic
 */
export const locationService = {
  /**
   * Get active city configuration
   */
  /**
   * Clear server cache (for cache invalidation on admin edits)
   */
  clearServerCache() {
    if (typeof window === 'undefined') {
      serverCache.activeCitySlug = undefined;
      serverCache.activeCity = {};
      serverCache.platformMode = undefined;
      serverCache.areasForCity = {};
      serverCache.cityBySlug = {};
      serverCache.areaBySlug = {};
    }
  },

  /**
   * Get active city configuration
   */
  async getActiveCity(citySlug?: string): Promise<City> {
    try {
      const activeCitySlug = citySlug || (await this.getActiveCitySlug());
      
      // Server-side cache read
      if (typeof window === 'undefined') {
        const cached = serverCache.activeCity?.[activeCitySlug];
        if (cached && isCacheValid(cached)) {
          return cached.data;
        }
      }

      const supabase = await getSupabaseClient();
      const { data, error } = await supabase
        .from('cities')
        .select('*')
        .eq('is_active', true)
        .eq('slug', activeCitySlug)
        .maybeSingle();

      if (error) {
        logger.warn(
          `Active city query failed, using Bhilwara fallback: ${describeSupabaseError(error)}`
        );
        return resolveCityFromSlug(activeCitySlug);
      }

      const result = (data as City) || resolveCityFromSlug(activeCitySlug);

      // Server-side cache write
      if (typeof window === 'undefined' && result) {
        if (!serverCache.activeCity) serverCache.activeCity = {};
        serverCache.activeCity[activeCitySlug] = { data: result, timestamp: Date.now() };
      }

      return result;
    } catch (error) {
      logger.warn('getActiveCity unexpected error, using Bhilwara fallback:', error);
      return resolveCityFromSlug(citySlug);
    }
  },

  /**
   * Get active city slug from config (most lightweight)
   */
  async getActiveCitySlug(): Promise<string> {
    try {
      // Server-side cache read
      if (typeof window === 'undefined' && serverCache.activeCitySlug && isCacheValid(serverCache.activeCitySlug)) {
        return serverCache.activeCitySlug.data;
      }

      const supabase = await getSupabaseClient();
      const { data, error } = await supabase
        .from('platform_config')
        .select('value')
        .eq('key', 'active_city_slug')
        .maybeSingle(); // Use maybeSingle to avoid errors when no row is found
      
      if (error) {
        logger.warn(
          `Failed to get active city slug from DB, falling back to ${DEFAULT_ACTIVE_CITY_SLUG}: ${describeSupabaseError(error)}`
        );
        return getPlatformConfig().active_city_slug;
      }

      const result = (data?.value as string) || getPlatformConfig().active_city_slug;

      // Server-side cache write
      if (typeof window === 'undefined') {
        serverCache.activeCitySlug = { data: result, timestamp: Date.now() };
      }

      return result;
    } catch (e) {
      logger.error('Unexpected error fetching active city slug, falling back:', e);
      return DEFAULT_CITY_SLUG;
    }
  },

  /**
   * Get platform mode (single-city or multi-city)
   */
  async getPlatformMode(): Promise<'single' | 'multi'> {
    try {
      // Server-side cache read
      if (typeof window === 'undefined' && serverCache.platformMode && isCacheValid(serverCache.platformMode)) {
        return serverCache.platformMode.data;
      }

      const supabase = await getSupabaseClient();
      const { data, error } = await supabase
        .from('platform_config')
        .select('value')
        .eq('key', 'active_city_mode')
        .maybeSingle();
      
      if (error) {
        logger.warn(`Failed to get platform mode from DB, falling back to single: ${describeSupabaseError(error)}`);
        return 'single';
      }

      const result = (data?.value as 'single' | 'multi') || 'single';

      // Server-side cache write
      if (typeof window === 'undefined') {
        serverCache.platformMode = { data: result, timestamp: Date.now() };
      }

      return result;
    } catch (e) {
      logger.error('Unexpected error fetching platform mode, falling back:', e);
      return 'single';
    }
  },

  /**
   * Get all areas for a city
   */
  async getAreasForCity(citySlug?: string): Promise<Area[]> {
    try {
      const slug = citySlug || await this.getActiveCitySlug();

      // Server-side cache read
      if (typeof window === 'undefined' && serverCache.areasForCity?.[slug] && isCacheValid(serverCache.areasForCity[slug])) {
        return serverCache.areasForCity[slug].data;
      }

      const supabase = await getSupabaseClient();
      const city = await this.getActiveCity(slug);
      if (city.id === FALLBACK_CITY.id) {
        return [];
      }
      
      const { data, error } = await supabase
        .from('areas')
        .select('*')
        .eq('city_id', city.id)
        .order('name', { ascending: true });
      
      if (error) {
        logger.warn(`Failed to get areas for city ${slug}: ${describeSupabaseError(error)}`);
        return [];
      }

      const result = data as Area[];

      // Server-side cache write
      if (typeof window === 'undefined') {
        if (!serverCache.areasForCity) serverCache.areasForCity = {};
        serverCache.areasForCity[slug] = { data: result, timestamp: Date.now() };
      }

      return result;
    } catch (e) {
      logger.error('Unexpected error fetching areas:', e);
      return [];
    }
  },

  /**
   * Get area by slug within a city
   */
  async getAreaBySlug(citySlug: string, areaSlug: string): Promise<Area | null> {
    const cacheKey = `${citySlug}:${areaSlug}`;
    if (typeof window === 'undefined') {
      const cached = serverCache.areaBySlug?.[cacheKey];
      if (cached && isCacheValid(cached)) {
        return cached.data;
      }
    }

    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('areas')
      .select(`
        *,
        city:cities(id, slug)
      `)
      .eq('cities.slug', citySlug)
      .eq('areas.slug', areaSlug)
      .single();
    
    if (error) {
      logger.error(`Failed to get area ${areaSlug}:`, error);
      return null;
    }
    const result = data as Area;

    if (typeof window === 'undefined') {
      if (!serverCache.areaBySlug) serverCache.areaBySlug = {};
      serverCache.areaBySlug[cacheKey] = { data: result, timestamp: Date.now() };
    }
    return result;
  },

  /**
   * Get city by slug
   */
  async getCityBySlug(slug: string): Promise<City | null> {
    if (typeof window === 'undefined') {
      const cached = serverCache.cityBySlug?.[slug];
      if (cached && isCacheValid(cached)) {
        return cached.data;
      }
    }

    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('cities')
      .select('*')
      .eq('slug', slug)
      .single();
    
    if (error) {
      logger.error(`Failed to get city ${slug}:`, error);
      return null;
    }
    const result = data as City;

    if (typeof window === 'undefined') {
      if (!serverCache.cityBySlug) serverCache.cityBySlug = {};
      serverCache.cityBySlug[slug] = { data: result, timestamp: Date.now() };
    }
    return result;
  },

  /**
   * Validate that worker is registering for correct city
   */
  async validateWorkerCity(areaSlug: string, expectedCitySlug?: string): Promise<{ valid: boolean; areaId: string | null; message: string }> {
    const targetSlug = expectedCitySlug || await this.getActiveCitySlug();
    const area = await this.getAreaBySlug(targetSlug, areaSlug);
    
    if (!area) {
      return {
        valid: false,
        areaId: null,
        message: `Area "${areaSlug}" not found in ${targetSlug}`
      };
    }

    return {
      valid: true,
      areaId: area.id,
      message: 'Worker city validation passed'
    };
  },

  /**
   * Validate client location for booking
   */
  async validateClientBooking(clientCitySlug: string, workerAreaId: string, expectedCitySlug?: string): Promise<{ valid: boolean; message: string }> {
    const targetSlug = expectedCitySlug || await this.getActiveCitySlug();
    
    if (clientCitySlug !== targetSlug) {
      return {
        valid: false,
        message: `Currently serving ${targetSlug} only. Cannot book outside this area.`
      };
    }

    // Verify worker area belongs to the city
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('areas')
      .select('city_id, cities(slug)')
      .eq('id', workerAreaId)
      .single();

    if (error || !data) {
      return {
        valid: false,
        message: 'Invalid service area'
      };
    }

    const cityData = data as { cities: { slug: string } | null };
    if (cityData.cities?.slug !== targetSlug) {
      return {
        valid: false,
        message: 'Worker is not in the expected service area'
      };
    }

    return {
      valid: true,
      message: 'Booking location validation passed'
    };
  },

  /**
   * Get workers filtered by city
   */
  async getWorkersByCity(citySlug?: string, filters?: { areaId?: string; category?: string; limit?: number; offset?: number }) {
    const supabase = await getSupabaseClient();
    const slug = citySlug || (await this.getActiveCitySlug());
    const city = (await this.getCityBySlug(slug)) ?? (await getActiveCity(slug));

    let query = supabase
      .from('workers')
      .select(`
        *,
        profile:profiles(*),
        location:worker_locations!inner(
          city_id,
          area_id,
          area:areas(*)
        )
      `, { count: 'exact' })
      .eq('location.city_id', city.id)
      .eq('status', 'approved');

    if (filters?.areaId) {
      query = query.eq('location.area_id', filters.areaId);
    }

    if (filters?.category) {
      query = query.eq('category', filters.category);
    }

    const { data, error, count } = await query
      .order('rating_avg', { ascending: false })
      .range(filters?.offset || 0, (filters?.offset || 0) + (filters?.limit || 20) - 1);

    const formatted = (data || []).map((w: any) => ({
      ...w,
      area: w.location?.area || null,
    }));

    return { workers: formatted, total: count || 0, error };
  },

  /**
   * (Admin only) Set active city
   */
  async setActiveCity(citySlug: string): Promise<{ success: boolean; message: string }> {
    const response = await fetch('/api/admin/config/active-city', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ citySlug }),
    });

    const result = await response.json().catch(() => ({}));

    if (!response.ok) {
      return {
        success: false,
        message: result.error || result.message || 'Failed to set active city',
      };
    }

    return {
      success: true,
      message: result.message || `Active city set to ${citySlug}`,
    };
  },

  /**
   * Get city for user (client or worker)
   * Returns the city they are registered/restricted to
   */
  async getUserCity(userId: string, userRole: 'worker' | 'client'): Promise<{ cityId: string; citySlug: string; areaId?: string; areaSlug?: string } | null> {
    const supabase = await getSupabaseClient();
    
    if (userRole === 'worker') {
      const { data } = await supabase
        .from('workers')
        .select(`
          location:worker_locations(
            city_id,
            area_id,
            city:cities(slug),
            area:areas(slug)
          )
        `)
        .eq('id', userId)
        .single();

      if (!data || !data.location) return null;
      const typed = data.location as {
        city_id: string;
        area_id: string;
        city: { slug: string } | null;
        area: { slug: string } | null;
      };
      return {
        cityId: typed.city_id,
        citySlug: typed.city?.slug ?? '',
        areaId: typed.area_id,
        areaSlug: typed.area?.slug,
      };
    } else {
      const { data } = await supabase
        .from('clients')
        .select(`
          city_id,
          area_id,
          city:cities(slug),
          area:areas(slug)
        `)
        .eq('id', userId)
        .single();

      if (!data) return null;
      const typed = data as {
        city_id: string;
        area_id: string;
        city: { slug: string } | null;
        area: { slug: string } | null;
      };
      return {
        cityId: typed.city_id,
        citySlug: typed.city?.slug ?? '',
        areaId: typed.area_id,
        areaSlug: typed.area?.slug,
      };
    }
  }
};
