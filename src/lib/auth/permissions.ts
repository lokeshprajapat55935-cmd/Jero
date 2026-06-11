export type UserRole = 'client' | 'worker' | 'admin';

export function isClient(role?: string | null): boolean {
  return role === 'client';
}

export function isWorker(role?: string | null): boolean {
  return role === 'worker';
}

export function isAdmin(role?: string | null): boolean {
  return role === 'admin';
}

export function hasRole(userRole?: string | null, allowedRoles?: UserRole[]): boolean {
  if (!allowedRoles || allowedRoles.length === 0) return true;
  if (!userRole) return false;
  return allowedRoles.includes(userRole as UserRole);
}

export function getAppDomainForRole(role?: string | null): string {
  if (isAdmin(role)) return '/admin';
  if (isWorker(role)) return '/worker';
  return '/client';
}
