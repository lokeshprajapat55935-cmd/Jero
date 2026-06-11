export type ActiveCityMode = 'single' | 'multi';

export interface PlatformConfig {
  active_city_slug: string;
  active_city_mode: ActiveCityMode;
}

export const DEFAULT_ACTIVE_CITY_SLUG = 'bhilwara';

export const platform_config: PlatformConfig = {
  active_city_slug: DEFAULT_ACTIVE_CITY_SLUG,
  active_city_mode: 'single',
};

export function getPlatformConfig(): PlatformConfig {
  return platform_config;
}

export function resolveActiveCitySlug(slug?: string | null): string {
  const normalized = slug?.trim().toLowerCase();
  if (!normalized) return platform_config.active_city_slug;
  return normalized;
}