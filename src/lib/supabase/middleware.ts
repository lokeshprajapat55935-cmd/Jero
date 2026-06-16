import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import type { AuthChangeEvent, Session } from '@supabase/supabase-js';
import { config } from '@/config';
import {
  getPostAuthPath,
  isAuthFlowPath,
  isOnboardingPath,
  isProtectedRoute,
} from '@/lib/auth/routes';
import { isClient, isWorker, isAdmin } from '@/lib/auth/permissions';

const AUTH_TIMEOUT_MS = 5000;

function withTimeout<T>(promise: PromiseLike<T>, timeoutMs = AUTH_TIMEOUT_MS): Promise<T | null> {
  return Promise.race([
    promise,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
  ]);
}

function redirectTo(request: NextRequest, pathname: string, search?: Record<string, string>) {
  const url = new URL(pathname, request.url);
  if (search) {
    Object.entries(search).forEach(([key, value]) => url.searchParams.set(key, value));
  }
  if (url.pathname === request.nextUrl.pathname && url.search === request.nextUrl.search) {
    return null;
  }
  return NextResponse.redirect(url);
}

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const pathname = request.nextUrl.pathname;
  const isSignOut = pathname.includes('/signout');
  const isCallback = pathname.includes('/callback');
  const protectedRoute = isProtectedRoute(pathname);
  const authFlow = isAuthFlowPath(pathname);
  const onboarding = isOnboardingPath(pathname);
  const isAdminRoute = pathname.startsWith('/admin');

  const needsSessionRefresh =
    protectedRoute || onboarding || isAdminRoute;

  if (!needsSessionRefresh) {
    return supabaseResponse;
  }

  const supabase = createServerClient(
    config.env.supabase.url!,
    config.env.supabase.anonKey!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const authResult = await withTimeout(supabase.auth.getUser());
  const user = authResult?.data.user ?? null;

  if (!user) {
    if (protectedRoute || isAdminRoute) {
      return (
        redirectTo(request, '/', { next: pathname }) ?? supabaseResponse
      );
    }
    return supabaseResponse;
  }

  const profileResult = await withTimeout(
    supabase.from('profiles').select('role, onboarded').eq('id', user.id).maybeSingle()
  );
  const profile = profileResult?.data ?? null;
  const onboarded = profile?.onboarded === true;
  const role = profile?.role ?? null;

  const isClientRoute = pathname.startsWith('/client');
  const isWorkerRoute = pathname.startsWith('/worker');

  if (isAdminRoute && !isAdmin(role)) {
    const redirect = redirectTo(request, '/');
    if (redirect) return redirect;
  }

  if (authFlow && !isSignOut && !isCallback) {
    const destination = getPostAuthPath(role, onboarded);
    const redirect = redirectTo(request, destination);
    if (redirect) return redirect;
  }

  if (isWorkerRoute && !authFlow && !isWorker(role)) {
    const redirect = redirectTo(request, '/');
    if (redirect) return redirect;
  }

  if (isClientRoute && !authFlow && !isClient(role)) {
    const redirect = redirectTo(request, '/');
    if (redirect) return redirect;
  }

  return supabaseResponse;
}
