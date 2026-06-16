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
    // Fail loudly: service role key is required for admin operations.
    throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY (service role key) in environment. Admin client cannot be created.');
  }

  return createSupabaseClient(url!, key);
}
