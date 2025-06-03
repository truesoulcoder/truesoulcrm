// src/lib/supabase/server.ts
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function createClient() { 
  const cookieStore = await cookies();

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Missing Supabase environment variables for client');
  }

  return createServerClient(
    supabaseUrl,
    supabaseAnonKey,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          try {
            cookieStore.set(name, value, options);
          } catch (error: unknown) { 
            if (process.env.NODE_ENV === 'development') {
              console.warn(`(Client) Failed to set cookie '${name}':`, error instanceof Error ? error.message : error);
            }
          }
        },
        remove(name: string, options: CookieOptions) {
          try {
            cookieStore.set(name, '', options);
          } catch (error: unknown) { 
            if (process.env.NODE_ENV === 'development') {
              console.warn(`(Client) Failed to remove cookie '${name}':`, error instanceof Error ? error.message : error);
            }
          }
        },
      },
    }
  );
}

// Function to create a Supabase client for server-side admin operations (uses service_role_key)
export async function createAdminServerClient() { 
  const cookieStore = await cookies(); // Renamed adminCookieStore to cookieStore for consistency

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  if (!supabaseUrl) {
    throw new Error("Missing env.NEXT_PUBLIC_SUPABASE_URL for admin client");
  }
  if (!supabaseServiceRoleKey) {
    throw new Error("Missing env.SUPABASE_SERVICE_ROLE_KEY. Ensure it's set and not prefixed with NEXT_PUBLIC_.");
  }

  return createServerClient(
    supabaseUrl,
    supabaseServiceRoleKey,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          try {
            cookieStore.set(name, value, options);
          } catch (error: unknown) { // Typed error
            console.warn(`(AdminClient) Failed to set cookie '${name}':`, error instanceof Error ? error.message : error);
          }
        },
        remove(name: string, options: CookieOptions) {
          try {
            cookieStore.set(name, '', options);
          } catch (error: unknown) { // Typed error
            console.warn(`(AdminClient) Failed to remove cookie '${name}':`, error instanceof Error ? error.message : error);
          }
        },
      },
      auth: {
        persistSession: false, // No session persistence for admin client
        autoRefreshToken: false, // No auto-refresh for admin client
        detectSessionInUrl: false, // Don't detect session from URL for admin client
      }
    }
  );
}
