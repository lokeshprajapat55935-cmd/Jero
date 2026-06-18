import { createErrorResponse } from '@/lib/api-utils';

interface RateLimitInfo {
  count: number;
  resetTime: number;
}

const rateLimitStore = new Map<string, RateLimitInfo>();

// Cleans up expired entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, info] of rateLimitStore.entries()) {
    if (now > info.resetTime) {
      rateLimitStore.delete(key);
    }
  }
}, 60000);

/**
 * Basic in-memory rate limiter for serverless environments.
 * @param identifier Unique ID (e.g. IP address or User ID)
 * @param limit Max requests per window
 * @param windowMs Time window in milliseconds
 * @returns boolean True if allowed, False if rate limited
 */
export function checkRateLimit(identifier: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const info = rateLimitStore.get(identifier);

  if (!info || now > info.resetTime) {
    rateLimitStore.set(identifier, {
      count: 1,
      resetTime: now + windowMs
    });
    return true;
  }

  if (info.count >= limit) {
    return false;
  }

  info.count += 1;
  return true;
}

/**
 * Helper to block request if rate limited
 */
export function applyRateLimit(identifier: string, limit: number = 10, windowMs: number = 60000) {
  const allowed = checkRateLimit(identifier, limit, windowMs);
  if (!allowed) {
    return createErrorResponse('Too Many Requests. Please try again later.', 429);
  }
  return null;
}
