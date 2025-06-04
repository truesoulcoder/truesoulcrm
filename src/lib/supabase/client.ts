import { createBrowserClient } from '@supabase/ssr';
import { SupabaseClient } from '@supabase/supabase-js';

// Create a singleton Supabase client instance
export const supabase: SupabaseClient = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  {
    realtime: {
      params: {
        // eventsPerSecond: 10, // Default, can keep commented unless specific needs arise
        heartbeatMs: 15000 // Set heartbeat to 15 seconds (default is 30000ms)
      }
    }
  }
);
