import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!serviceKey) {
  throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY environment variable. This key should NOT be prefixed with NEXT_PUBLIC_.');
}

/**
 * Returns a Supabase client authenticated with the service role key for admin operations.
 */
export function getAdminSupabaseClient() {
  return createClient(supabaseUrl, serviceKey);
}
