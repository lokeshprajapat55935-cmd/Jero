export async function adminFetch(input: RequestInfo | URL, init?: RequestInit) {
  const isStateChanging = init?.method && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(init.method.toUpperCase());
  const headers = new Headers(init?.headers);

  if (isStateChanging) {
    // Extract Double Submit CSRF token from cookie
    const match = typeof document !== 'undefined' ? document.cookie.match(new RegExp('(^| )admin_csrf_token=([^;]+)')) : null;
    const csrfToken = match ? match[2] : '';
    if (csrfToken) {
      headers.set('X-CSRF-Token', csrfToken);
    }
  }

  return fetch(input, {
    ...init,
    headers,
  });
}
