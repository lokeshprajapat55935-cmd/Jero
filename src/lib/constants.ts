/**
 * Global Constants
 */

export const APP_NAME = 'Zolvo';

// Location Configuration
export const ACTIVE_CITY = {
  name: 'Bhilwara',
  state: 'Rajasthan',
  country: 'India',
  slug: 'bhilwara',
  description: 'Professional local services marketplace',
};

export const ROUTES = {
  HOME: '/',
  LOGIN: '/',
  DASHBOARD: '/dashboard',
  CLIENT_HOME: '/dashboard',
  SEARCH: '/search',
  CLIENT_SEARCH: '/search',
  PARTNER: '/partner',
  WORKER_DASHBOARD: '/worker/dashboard',
  BOOKINGS: '/activity',
  CLIENT_BOOKINGS: '/activity',
  PROFILE: '/profile',
  CLIENT_PROFILE: '/profile',
  SETTINGS: '/settings',
  ACTIVITY: '/activity',
  CLIENT_NOTIFICATIONS: '/notifications',
  CLIENT_EMERGENCY: '/emergency',
  AUTH: {
    LOGIN: '/',
    WORKER_APPLY: '/worker/apply',
    WORKER_LOGIN: '/worker/login',
    ADMIN_LOGIN: '/admin/login',
  },
  WORKER_JOBS: '/worker/jobs',
  WORKER_EARNINGS: '/worker/earnings',
  WORKER_PROFILE: '/worker/profile',
  ADMIN_DASHBOARD: '/admin/dashboard',
} as const;

export const CATEGORIES = [
  { id: 'electrician', name: 'Electrician', slug: 'Electrician' },
  { id: 'plumber', name: 'Plumber', slug: 'Plumber' },
] as const;

export const DEFAULT_CURRENCY = 'INR';
export const CURRENCY_SYMBOL = '₹';

// SEO Constants
export const SEO_METADATA = {
  title: `Zolvo - Professional Services in ${ACTIVE_CITY.name}`,
  description: `Find trusted electricians and plumbers in ${ACTIVE_CITY.name}, ${ACTIVE_CITY.state}. Book verified professionals for home services.`,
  keywords: [
    `electrician in ${ACTIVE_CITY.name}`,
    `plumber in ${ACTIVE_CITY.name}`,
    `home services ${ACTIVE_CITY.name}`,
    `local services marketplace`,
  ].join(', '),
};

// Bhilwara-specific messaging
export const LOCATION_MESSAGING = {
  serviceArea: `Currently available in ${ACTIVE_CITY.name}`,
  expansion: 'We are expanding city-by-city across India',
  registrationRestriction: `Workers can only register for ${ACTIVE_CITY.name} at this time`,
  bookingRestriction: `Bookings are available only in ${ACTIVE_CITY.name}`,
};
