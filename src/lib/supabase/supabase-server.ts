
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { config } from '@/config';

export async function createClient() {
  const cookieStore = await cookies();
  const url = config.env.supabase.url;
  const key = config.env.supabase.anonKey;

  if (!url || !key) {
    throw new Error('Missing Supabase URL or Anon Key in environment variables');
  }

  return createServerClient(
    url,
    key,
    {
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

