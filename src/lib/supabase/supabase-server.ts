import { createServerClient } from '@supabase/ssr';
import { cookies, headers } from 'next/headers';
import { config } from '@/config';

export async function createClient() {
  const cookieStore = await cookies();
  const headersList = await headers();
  const url = config.env.supabase.url;
  const key = config.env.supabase.anonKey;

  if (!url || !key) {
    throw new Error('Missing Supabase URL or Anon Key in environment variables');
  }

  const appType = headersList.get('x-zolvo-app-type') || 'customer';
  const cookieName = appType === 'worker' ? 'zolvo_worker_session' : 'zolvo_customer_session';

  return createServerClient(
    url,
    key,
    {
      cookieOptions: {
        name: cookieName,
      },
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // The `setAll` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing
            // user sessions.
          }
        },
      },
    }
  );
}
