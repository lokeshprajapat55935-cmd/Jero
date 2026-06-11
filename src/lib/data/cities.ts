import type { City } from '@/types/location';
import { getPlatformConfig } from './platform_config';

export const DEFAULT_CITY_SLUG = 'bhilwara';

export const BHILWARA_CITY: City = {
  id: 'bhilwara',
  name: 'Bhilwara',
  slug: 'bhilwara',
  state_id: 'rajasthan',
  description: 'Professional local services marketplace',
  is_active: true,
  latitude: 25.3407,
  longitude: 74.6313,
  service_radius_km: 25,
  created_at: '1970-01-01T00:00:00.000Z',
};

export const cities: City[] = [BHILWARA_CITY];
export const CITIES = cities;

export function getCityBySlug(slug: string): City | undefined {
  const normalized = slug?.trim().toLowerCase();
  if (!normalized) return undefined;
  return cities.find((c) => c.slug === normalized && c.is_active);
}

export function getDefaultCity(): City {
  return getCityBySlug(DEFAULT_CITY_SLUG) ?? BHILWARA_CITY;
}

export function resolveCityFromSlug(slug?: string | null): City {
  const normalized = slug?.trim().toLowerCase();
  if (!normalized) return getDefaultCity();
  return getCityBySlug(normalized) ?? getDefaultCity();
}

export function resolveActiveCity(citySlug?: string): City {
  const config = getPlatformConfig();
  const slug = citySlug ?? config.active_city_slug;
  return resolveCityFromSlug(slug);
}

export function workerMatchesCity(workerCityId: string | null | undefined, activeCity: City): boolean {
  if (!workerCityId) return true;
  return workerCityId === activeCity.id || workerCityId === activeCity.slug;
}