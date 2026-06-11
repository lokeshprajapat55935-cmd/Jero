import { createClient } from './client';

/**
 * Dynamic Supabase client resolver.
 * Resolved to the browser client directly to avoid compiling next/headers in client context.
 */
export async function getSupabaseClient() {
  return createClient();
}

