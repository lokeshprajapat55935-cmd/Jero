import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import logger from '@/lib/logger';
import { config } from '@/config';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifyAdminSession, ADMIN_COOKIE_NAME } from '@/lib/admin/auth';

/**
 * Resolves User ID from either Supabase Auth (primary), Firebase/Custom cookie (fallback), or Admin Session JWT
 */
export async function getAuthUserId(request: NextRequest | Request, supabase: any): Promise<string | null> {
  let resolvedId: string | null = null;

  // 1. Check for isolated admin session JWT (highest priority for admin-related flows)
  try {
    const cookieHeader = request.headers.get('cookie') || '';
    const adminMatch = cookieHeader.match(new RegExp(`(?:^|;\\s*)${ADMIN_COOKIE_NAME}=([^;]+)`));
    if (adminMatch && adminMatch[1]) {
      const token = decodeURIComponent(adminMatch[1]);
      const payload = await verifyAdminSession(token);
      if (payload?.admin_id) {
        resolvedId = payload.admin_id;
        logger.info(`[getAuthUserId] found admin_id from admin session JWT: "${resolvedId}"`);
      }
    }
  } catch (e) {
    logger.error('[getAuthUserId] admin session parse error:', e);
  }

  // 2. Check custom/Firebase auth cookie fallback
  if (!resolvedId) {
    try {
      const cookieHeader = request.headers.get('cookie') || '';
      const match = cookieHeader.match(/(?:^|;\s*)(zolvo_worker_uid|zolvo_customer_uid)=([^;]+)/);
      if (match && match[2]) {
        resolvedId = decodeURIComponent(match[2]);
        logger.info(`[getAuthUserId] found ${match[1]} from raw cookie: "${resolvedId}"`);
      }
    } catch (e) {
      logger.error('[getAuthUserId] cookie parse error:', e);
    }
  }

  // Fallback: try request.cookies if it exists (NextRequest)
  if (!resolvedId) {
    try {
      const reqWithCookies = request as any;
      if (typeof reqWithCookies.cookies?.get === 'function') {
        const cookieUid = reqWithCookies.cookies.get('zolvo_worker_uid')?.value || 
                          reqWithCookies.cookies.get('zolvo_customer_uid')?.value;
        if (cookieUid) {
          resolvedId = cookieUid;
          logger.info(`[getAuthUserId] found user from request.cookies: "${resolvedId}"`);
        }
      }
    } catch (e) {
      // Ignore
    }
  }

  if (!resolvedId) {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user?.id) {
        resolvedId = user.id;
        logger.info(`[getAuthUserId] found user from Supabase auth: "${resolvedId}"`);
      }
    } catch (e) {
      // Ignore Supabase auth errors
    }
  }

  logger.info(`[getAuthUserId] resolvedId before UUID check: "${resolvedId}"`);
  if (!resolvedId || resolvedId === 'null' || resolvedId === 'undefined') return null;

  let finalUserId = resolvedId;

  // Resolve to profiles.id if resolvedId is a Firebase UID (non-UUID string)
  const isUuid = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(resolvedId);
  if (!isUuid) {
    try {
      const admin = createAdminClient();
      const { data, error } = await admin
        .from('profiles')
        .select('id')
        .eq('firebase_uid', resolvedId)
        .maybeSingle();
      if (!error && data?.id) {
        logger.info(`[getAuthUserId] resolved Firebase UID "${resolvedId}" to profile UUID: "${data.id}"`);
        finalUserId = data.id;
      } else {
        logger.warn(`[getAuthUserId] Could not resolve profiles UUID for Firebase UID: ${resolvedId}`, { error });
        return null; // Return null instead of non-UUID string to prevent downstream DB errors
      }
    } catch (e) {
      logger.error(`[getAuthUserId] Exception resolving profiles UUID for Firebase UID: ${resolvedId}`, e);
      return null;
    }
  }

  // --- Strict Backend Role Isolation for APIs ---
  try {
    const urlStr = request.url || '';
    if (urlStr) {
      const url = new URL(urlStr);
      const pathname = url.pathname;
      
      const isCustomerApi = pathname.startsWith('/api/customer/') || pathname.startsWith('/api/client/');
      const isWorkerApi = pathname.startsWith('/api/worker/') || pathname.startsWith('/api/dispatch/');

      if (isCustomerApi || isWorkerApi) {
        const admin = createAdminClient();
        const { data: profile } = await admin
          .from('profiles')
          .select('role')
          .eq('id', finalUserId)
          .maybeSingle();

        const actualRole = profile?.role;
        
        if (isCustomerApi && actualRole === 'worker') {
          logger.warn(`[Role Isolation] Blocked worker ${finalUserId} from accessing customer API: ${pathname}`);
          return null;
        }

        if (isWorkerApi && actualRole === 'client') {
          logger.warn(`[Role Isolation] Blocked client ${finalUserId} from accessing worker API: ${pathname}`);
          return null;
        }
      }
    }
  } catch (err) {
    logger.error('[Role Isolation] Error parsing URL or checking role', err);
    // fail open or closed? Safe to continue if URL parsing fails, but DB error should maybe block.
  }

  return finalUserId;
}

/**
 * Standard API Response Structure
 */
export function createResponse<T>(data: T, status: number = 200) {
  return NextResponse.json(
    {
      success: true,
      data,
    },
    { status }
  );
}

/**
 * Standard API Error Structure
 */
export function createErrorResponse(message: string, status: number = 400, errors?: any) {
  return NextResponse.json(
    {
      success: false,
      error: message,
      details: errors,
    },
    { status }
  );
}

/**
 * Handle API Errors
 */
export function handleApiError(error: any) {
  logger.error('[API Error]', error);
  
  const isDev = config.env.isDev;

  // Handle Supabase errors
  if (error && typeof error === 'object' && 'code' in error) {
    // P0001 is user-raised exception from triggers or functions (e.g. state validations, distance checks)
    if (error.code === 'P0001' || error.message?.includes('P0001')) {
      // Strip system formatting if needed, return clean message
      const cleanMessage = error.message ? error.message.replace(/^(P0001:|Exception:|RAISE EXCEPTION:)/i, '').trim() : 'Validation failed';
      return createErrorResponse(cleanMessage, 400);
    }
    // Handle missing relations (tables/columns) gracefully
    if (error.code === '42P01' || error.code === '42703') {
      return createErrorResponse('Resource not available', 404, isDev ? error : undefined);
    }

    return createErrorResponse(
      isDev ? `[DB ${error.code}]: ${error.message || 'Database error'}` : 'A database error occurred',
      error.code === 'PGRST116' ? 404 : 500,
      isDev ? error : undefined
    );
  }

  // Generic errors
  const message = isDev ? (error.message || 'An unexpected error occurred') : 'An unexpected internal error occurred';
  const status = error.status || 500;
  
  return createErrorResponse(
    message,
    status,
    isDev ? error : undefined
  );
}
