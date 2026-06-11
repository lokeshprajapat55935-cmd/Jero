import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { config } from '@/config';

/**
 * Create admin client for server-side operations.
 * Uses service role key for elevated permissions.
 */
export function createAdminClient() {
  const url = config.env.supabase.url;
  const key = config.env.supabase.serviceRoleKey;
  
  if (!url || !key) {
    console.warn('Missing Supabase Service Role Key. Admin client may fail if RLS bypass is required.');
  }

  return createSupabaseClient(
    url!,
    key || config.env.supabase.anonKey! // Fallback to anon key to prevent crashes, though it won't have admin privileges
  );
}
