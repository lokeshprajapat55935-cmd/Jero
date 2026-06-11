import { createBrowserClient } from '@supabase/ssr';
import { config } from '@/config';

let client: ReturnType<typeof createBrowserClient> | null = null;

export function createClient() {
  const url = config.env.supabase.url;
  const key = config.env.supabase.anonKey;

  if (!url || !key) {
    throw new Error('Missing Supabase URL or Anon Key in environment variables');
  }

  if (typeof window === 'undefined') {
    return createBrowserClient(url, key);
  }
  
  if (!client) {
    client = createBrowserClient(url, key);
  }
  
  return client;
}
