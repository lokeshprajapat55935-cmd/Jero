import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import logger from '@/lib/logger';
import { config } from '@/config';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Resolves User ID from either Supabase Auth (primary) or Firebase/Custom cookie (fallback)
 */
export async function getAuthUserId(request: NextRequest | Request, supabase: any): Promise<string | null> {
  let resolvedId: string | null = null;

  // Check custom/Firebase auth cookie fallback first (avoids slow/unresponsive remote Supabase auth requests)
  // We read from raw Cookie header since `request` may be a plain Request (not NextRequest)
  try {
    const cookieHeader = request.headers.get('cookie') || '';
    logger.info(`[getAuthUserId] raw cookie header: "${cookieHeader}"`);
    const match = cookieHeader.match(/(?:^|;\s*)zolvo_auth_uid=([^;]+)/);
    if (match && match[1]) {
      resolvedId = decodeURIComponent(match[1]);
      logger.info(`[getAuthUserId] found zolvo_auth_uid from raw cookie: "${resolvedId}"`);
    }
  } catch (e) {
    logger.error('[getAuthUserId] cookie parse error:', e);
  }

  // Fallback: try request.cookies if it exists (NextRequest)
  if (!resolvedId) {
    try {
      const reqWithCookies = request as any;
      if (typeof reqWithCookies.cookies?.get === 'function') {
        const cookieUid = reqWithCookies.cookies.get('zolvo_auth_uid')?.value;
        if (cookieUid) {
          resolvedId = cookieUid;
          logger.info(`[getAuthUserId] found zolvo_auth_uid from request.cookies: "${resolvedId}"`);
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
        return data.id;
      }
      logger.warn(`[getAuthUserId] Could not resolve profiles UUID for Firebase UID: ${resolvedId}`, { error });
      return null; // Return null instead of non-UUID string to prevent downstream DB errors
    } catch (e) {
      logger.error(`[getAuthUserId] Exception resolving profiles UUID for Firebase UID: ${resolvedId}`, e);
      return null;
    }
  }

  return resolvedId;
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
  
  // Handle Supabase errors
  if (error && typeof error === 'object' && 'code' in error) {
    const isDev = config.env.isDev;
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

  const message = error.message || 'An unexpected error occurred';
  const status = error.status || 500;
  
  return createErrorResponse(
    message,
    status,
    config.env.isDev ? error : undefined
  );
}
