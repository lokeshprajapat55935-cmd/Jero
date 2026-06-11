import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // 1. Check for standard auth cookies
  const hasAuthCookie = request.cookies.has('zolvo_auth_uid');
  const roleCookieRaw = request.cookies.get('zolvo_role')?.value; // 'client' or 'partner'
  const roleCookie = roleCookieRaw === 'worker' ? 'partner' : roleCookieRaw;

  // Define client-specific routes (customer area)
  const clientRoutes = ['/dashboard', '/profile', '/search', '/activity', '/booking', '/wallet', '/settings', '/notifications'];
  const isClientRoute = clientRoutes.some(route => pathname === route || pathname.startsWith(route + '/'));
  
  // Define partner-specific routes (worker area)
  const isPartnerRoute = pathname.startsWith('/partner') || pathname.startsWith('/worker');
  
  // Define admin-specific routes
  const isAdminRoute = pathname.startsWith('/admin') && pathname !== '/admin/login';

  // If trying to access protected routes without being logged in or missing role session
  const isProtected = isClientRoute || isPartnerRoute || isAdminRoute;
  if (isProtected && (!hasAuthCookie || !roleCookie)) {
    if (isAdminRoute) {
      return NextResponse.redirect(new URL('/admin/login', request.url));
    }
    return NextResponse.redirect(new URL('/', request.url));
  }

  // Redirect root /partner or /worker to their respective dashboards
  if (pathname === '/partner' || pathname === '/partner/') {
    return NextResponse.redirect(new URL('/partner/dashboard', request.url));
  }
  if (pathname === '/worker' || pathname === '/worker/') {
    return NextResponse.redirect(new URL('/partner/dashboard', request.url));
  }

  // Strict Role-Based Sandboxing
  if (hasAuthCookie && roleCookie) {
    // A Client trying to access Partner or Admin routes
    if (roleCookie === 'client' && (isPartnerRoute || isAdminRoute)) {
      return NextResponse.redirect(new URL('/dashboard', request.url));
    }
    
    // A Partner trying to access Client or Admin routes
    if (roleCookie === 'partner' && (isClientRoute || isAdminRoute)) {
      return NextResponse.redirect(new URL('/partner/dashboard', request.url));
    }
  }

  const response = NextResponse.next();
  
  // 2. Google ReCAPTCHA and Firebase CSP Headers
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://sezlmssvkpzrohtjsgyl.supabase.co';
  const supabaseWsUrl = supabaseUrl.replace('https://', 'wss://');

  const cspHeader = `
    default-src 'self';
    script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.google.com https://www.gstatic.com https://apis.google.com https://www.recaptcha.net;
    script-src-elem 'self' 'unsafe-inline' https://www.google.com https://www.gstatic.com https://www.recaptcha.net;
    frame-src 'self' https://www.google.com https://recaptcha.google.com https://www.recaptcha.net https://apnora-fc153.firebaseapp.com;
    connect-src 'self' https://identitytoolkit.googleapis.com ${supabaseUrl} ${supabaseWsUrl} https://securetoken.googleapis.com https://recaptchaenterprise.googleapis.com https://firebaseinstallations.googleapis.com https://www.google.com https://www.gstatic.com https://www.recaptcha.net;
    style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://www.gstatic.com;
    font-src 'self' https://fonts.gstatic.com;
    img-src 'self' blob: data: https://www.google.com https://avatar.vercel.sh ${supabaseUrl};
    frame-ancestors 'self';
  `.replace(/\s{2,}/g, ' ').trim();

  response.headers.set('Content-Security-Policy', cspHeader);

  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};