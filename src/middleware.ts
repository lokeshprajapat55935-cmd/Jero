import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { verifyAdminSession } from '@/lib/admin/auth';
import { createServerClient } from '@supabase/ssr';
import { config as appConfig } from '@/config';

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  let isWorkerRoute = pathname.startsWith('/partner') || pathname.startsWith('/worker');
  if (pathname.startsWith('/api/')) {
    const referer = request.headers.get('referer') || '';
    if (referer.includes('/partner') || referer.includes('/worker')) {
      isWorkerRoute = true;
    }
  }

  const appType = isWorkerRoute ? 'worker' : 'customer';
  const cookieName = isWorkerRoute ? 'zolvo_worker_session' : 'zolvo_customer_session';

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-zolvo-app-type', appType);

  let response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });

  response.headers.set('x-zolvo-app-type', appType);

  // 0. Supabase Session Refresh (Crucial for preventing 401s on API routes)
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || appConfig.env.supabase.url;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || appConfig.env.supabase.anonKey;

  if (supabaseUrl && supabaseKey) {
    const supabase = createServerClient(supabaseUrl, supabaseKey, {
      cookieOptions: { name: cookieName },
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({
            request: {
              headers: requestHeaders,
            },
          });
          response.headers.set('x-zolvo-app-type', appType);
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    });
    // This refreshes the session if expired and updates the cookies in 'response'
    await supabase.auth.getUser().catch(() => {});
  }

  // Helper to apply accumulated cookies to any new response (like redirects)
  const applyCookies = (newResponse: NextResponse) => {
    response.cookies.getAll().forEach(cookie => {
      newResponse.cookies.set(cookie.name, cookie.value);
    });
    newResponse.headers.set('x-zolvo-app-type', appType);
    return newResponse;
  };

  // 1. Check for standard auth cookies
  const hasAuthCookie = request.cookies.has(isWorkerRoute ? 'zolvo_worker_uid' : 'zolvo_customer_uid');
  const roleCookieRaw = request.cookies.get(isWorkerRoute ? 'zolvo_worker_role' : 'zolvo_customer_role')?.value; // 'client' or 'partner'
  const roleCookie = roleCookieRaw === 'worker' ? 'partner' : roleCookieRaw;

  // 2. Check for isolated admin session
  const adminToken = request.cookies.get('zolvo_admin_session')?.value;
  let isAdminAuthenticated = false;

  if (adminToken) {
    const adminPayload = await verifyAdminSession(adminToken);
    if (adminPayload && adminPayload.role === 'admin' && adminPayload.admin_role === 'super_admin') {
      isAdminAuthenticated = true;
    }
  }

  // Define admin-specific routes (including the old /admin and new /admin/...)
  const isAdminRoute = (pathname.startsWith('/admin') || pathname === '/api/admin' || pathname.startsWith('/api/admin/')) && !pathname.startsWith('/admin-login');

  // CSRF Protection via Origin/Referer for state-changing Admin API requests
  if ((pathname === '/api/admin' || pathname.startsWith('/api/admin/')) && !['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
    const origin = request.headers.get('origin');
    const referer = request.headers.get('referer');
    const host = request.headers.get('host') || '';
    
    if (!origin && !referer) {
      return applyCookies(new NextResponse('403 Forbidden - Missing CSRF Headers', { status: 403 }));
    }
    
    // Check against host (supporting both http for local dev and https for prod)
    const isValidOrigin = origin ? (origin === `https://${host}` || origin === `http://${host}`) : true;
    const isValidReferer = referer ? (referer.startsWith(`https://${host}/`) || referer.startsWith(`http://${host}/`)) : true;

    if (!isValidOrigin || !isValidReferer) {
      return applyCookies(new NextResponse('403 Forbidden - Invalid Origin/Referer', { status: 403 }));
    }

    // Double Submit Cookie CSRF Validation
    const csrfTokenHeader = request.headers.get('x-csrf-token');
    const csrfTokenCookie = request.cookies.get('admin_csrf_token')?.value;

    if (!csrfTokenHeader || !csrfTokenCookie || csrfTokenHeader !== csrfTokenCookie) {
      return applyCookies(new NextResponse('403 Forbidden - Invalid CSRF Token', { status: 403 }));
    }
  }

  // Strict Admin Isolation
  if (isAdminRoute) {
    if (isAdminAuthenticated) {
      return applyCookies(response);
    }
    if (hasAuthCookie) {
      return applyCookies(new NextResponse('403 Forbidden - Admin Access Only', { status: 403 }));
    }
    if (pathname.startsWith('/api/')) {
      return applyCookies(new NextResponse('401 Unauthorized', { status: 401 }));
    }
    return applyCookies(NextResponse.redirect(new URL('/admin-login', request.url)));
  }

  if (pathname.startsWith('/admin-login') && isAdminAuthenticated) {
    return applyCookies(NextResponse.redirect(new URL('/admin/dashboard', request.url)));
  }

  // ----------------------------------------------------------------------
  // EXISTING CUSTOMER/WORKER LOGIC (UNTOUCHED BEHAVIOR)
  // ----------------------------------------------------------------------

  // Define client-specific routes (customer area)
  const clientRoutes = ['/dashboard', '/profile', '/search', '/activity', '/booking', '/wallet', '/settings', '/notifications'];
  const isClientRoute = clientRoutes.some(route => pathname === route || pathname.startsWith(route + '/'));
  
  // Define partner-specific routes (worker area)
  const isPartnerRoute = pathname.startsWith('/partner') || pathname.startsWith('/worker');

  // If trying to access protected routes without being logged in or missing role session
  const isProtected = isClientRoute || isPartnerRoute;
  if (isProtected && (!hasAuthCookie || !roleCookie)) {
    return applyCookies(NextResponse.redirect(new URL('/', request.url)));
  }

  // Redirect root /partner or /worker to their respective dashboards
  if (pathname === '/partner' || pathname === '/partner/') {
    return applyCookies(NextResponse.redirect(new URL('/partner/dashboard', request.url)));
  }
  if (pathname === '/worker' || pathname === '/worker/') {
    return applyCookies(NextResponse.redirect(new URL('/partner/dashboard', request.url)));
  }

  // Strict Role-Based Sandboxing
  if (hasAuthCookie && roleCookie) {
    // A Client trying to access Partner routes
    if (roleCookie === 'client' && isPartnerRoute) {
      const redirectResponse = NextResponse.redirect(new URL('/', request.url));
      redirectResponse.cookies.delete('zolvo_customer_uid');
      redirectResponse.cookies.delete('zolvo_customer_role');
      redirectResponse.cookies.delete('zolvo_customer_session');
      return applyCookies(redirectResponse);
    }
    
    // A Partner trying to access Client routes
    if (roleCookie === 'partner' && isClientRoute) {
      const redirectResponse = NextResponse.redirect(new URL('/', request.url));
      redirectResponse.cookies.delete('zolvo_worker_uid');
      redirectResponse.cookies.delete('zolvo_worker_role');
      redirectResponse.cookies.delete('zolvo_worker_session');
      return applyCookies(redirectResponse);
    }
  }
  
  // 2. Google ReCAPTCHA and Firebase CSP Headers
  const supabaseUrlCsp = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://sezlmssvkpzrohtjsgyl.supabase.co';
  const supabaseWsUrlCsp = supabaseUrlCsp.replace('https://', 'wss://');

  const cspHeader = `
    default-src 'self';
    script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.google.com https://www.gstatic.com https://apis.google.com https://www.recaptcha.net;
    script-src-elem 'self' 'unsafe-inline' https://www.google.com https://www.gstatic.com https://www.recaptcha.net;
    frame-src 'self' https://www.google.com https://recaptcha.google.com https://www.recaptcha.net https://apnora-fc153.firebaseapp.com;
    connect-src 'self' https://identitytoolkit.googleapis.com ${supabaseUrlCsp} ${supabaseWsUrlCsp} https://securetoken.googleapis.com https://recaptchaenterprise.googleapis.com https://firebaseinstallations.googleapis.com https://www.google.com https://www.gstatic.com https://www.recaptcha.net;
    style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://www.gstatic.com;
    font-src 'self' https://fonts.gstatic.com;
    img-src 'self' blob: data: https://www.google.com https://avatar.vercel.sh ${supabaseUrlCsp};
    frame-ancestors 'self';
  `.replace(/\s{2,}/g, ' ').trim();

  response.headers.set('Content-Security-Policy', cspHeader);

  // Strict Enterprise Security Headers
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  
  if (isAdminRoute) {
    response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    response.headers.set('Pragma', 'no-cache');
    response.headers.set('Expires', '0');
  }

  return applyCookies(response);
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};