/** Routes that require an authenticated session. */
export const PROTECTED_ROUTE_PREFIXES = [
  '/client',
  '/worker',
  '/admin',
] as const;

/** Auth pages where onboarding redirect must not run (user is mid-login). */
export const AUTH_FLOW_PATHS = [
  '/',
  '/worker/apply',
  '/worker/login',
  '/admin/login',
  '/auth/callback',
  '/auth/signout',
] as const;

export const ONBOARDING_PATHS = [] as const;

export function isProtectedRoute(pathname: string): boolean {
  // Exclude auth pages that might share a prefix (like /worker/login)
  if (isAuthFlowPath(pathname)) return false;

  return PROTECTED_ROUTE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

export function isAuthFlowPath(pathname: string): boolean {
  return AUTH_FLOW_PATHS.some(
    (path) => pathname === path || (path !== '/' && pathname.startsWith(`${path}/`))
  );
}

export function isOnboardingPath(pathname: string): boolean {
  return ONBOARDING_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`)
  );
}

export function getPostAuthPath(role?: string | null, onboarded?: boolean): string {
  if (role === 'admin') return '/admin/dashboard';
  if (role === 'worker') return '/worker/dashboard';
  return '/dashboard';
}