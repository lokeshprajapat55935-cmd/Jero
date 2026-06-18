import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import crypto from 'crypto';

const SECRET_KEY = new TextEncoder().encode(
  process.env.SUPABASE_JWT_SECRET || 'fallback-super-secret-key-for-admin-do-not-use-in-prod'
);

export const ADMIN_COOKIE_NAME = 'zolvo_admin_session';
export const ADMIN_CSRF_COOKIE_NAME = 'admin_csrf_token';

export interface AdminSessionPayload {
  admin_id: string;
  role: 'admin';
  admin_role: 'super_admin';
  exp?: number;
}

/**
 * Creates a signed JWT for the admin session and sets it in the cookies.
 * Also generates and sets a Double Submit CSRF token cookie.
 */
export async function createAdminSession(admin_id: string) {
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

  const sessionToken = await new SignJWT({
    admin_id,
    role: 'admin',
    admin_role: 'super_admin',
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('24h')
    .sign(SECRET_KEY);

  const cookieStore = await cookies();
  
  // Set the Secure HttpOnly session cookie
  cookieStore.set(ADMIN_COOKIE_NAME, sessionToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    expires: expiresAt,
  });

  // Generate a random CSRF token
  const csrfToken = crypto.randomUUID();

  // Set the CSRF token cookie (NOT HttpOnly, so JS can read it for double submit)
  cookieStore.set(ADMIN_CSRF_COOKIE_NAME, csrfToken, {
    httpOnly: false,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    expires: expiresAt,
  });

  return sessionToken;
}

/**
 * Verifies the admin session token.
 * Returns the decoded payload if valid, otherwise null.
 */
export async function verifyAdminSession(token: string): Promise<AdminSessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, SECRET_KEY, {
      algorithms: ['HS256'],
    });

    if (payload.role !== 'admin' || payload.admin_role !== 'super_admin') {
      return null;
    }

    return payload as unknown as AdminSessionPayload;
  } catch (error) {
    return null;
  }
}

/**
 * Clears the admin session cookie and CSRF cookie.
 */
export async function clearAdminSession() {
  const cookieStore = await cookies();
  cookieStore.delete(ADMIN_COOKIE_NAME);
  cookieStore.delete(ADMIN_CSRF_COOKIE_NAME);
}

/**
 * Gets the current verified admin session from cookies.
 * This can be used in React Server Components or Route Handlers.
 */
export async function getAdminSession(): Promise<AdminSessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_COOKIE_NAME)?.value;
  
  if (!token) return null;

  return verifyAdminSession(token);
}
