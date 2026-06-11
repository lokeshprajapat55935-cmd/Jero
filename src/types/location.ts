export interface City {
  id: string;
  name: string;
  slug: string;
  state_id: string;
  description?: string;
  is_active: boolean;
  latitude?: number;
  longitude?: number;
  service_radius_km?: number;
  created_at: string;
}

export interface Area {
  id: string;
  city_id: string;
  name: string;
  display_name: string;
  slug: string;
  pincode?: string;
  latitude?: number;
  longitude?: number;
  created_at: string;
}

export interface PlatformConfig {
  active_city_slug: string;
  active_city_mode: 'single' | 'multi';
}