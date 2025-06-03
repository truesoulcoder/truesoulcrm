// src/lib/supabase/server.ts
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';

export function createClient() { 
  const cookieStore = cookies();
  
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
        getAll() {
          const allCookies = cookieStore.getAll();
          return allCookies.map(cookie => ({ name: cookie.name, value: cookie.value }));
        },
        setAll(cookiesToSet: Array<{ name: string; value: string; options: CookieOptions }>) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              const cookieOptionsWithDefaults = { ...options, path: options.path || '/' };
              cookieStore.set(name, value, cookieOptionsWithDefaults);
            });
          } catch (error: unknown) {
            let errorMessage = "An error occurred while setting cookies in createClient.";
            if (error instanceof Error) {
              errorMessage = error.message;
            } else if (typeof error === 'string') {
              errorMessage = error;
            }
            console.warn(`(createClient) Error in 'setAll' cookie method: ${errorMessage}`);
          }
        },
      },
    }
  );
}

// Function to create a Supabase client for server-side admin operations (uses service_role_key)
export function createAdminServerClient() { 
  const cookieStore = cookies();

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  if (!supabaseUrl) {
    throw new Error("Missing env.NEXT_PUBLIC_SUPABASE_URL for admin client");
  }
  if (!supabaseServiceRoleKey) {
    throw new Error("Missing env.SUPABASE_SERVICE_ROLE_KEY. Ensure it's set and not prefixed with NEXT_PUBLIC_.");
  }

  return createServerClient(supabaseUrl, supabaseServiceRoleKey, {
    cookies: {
      getAll() {
        const allCookies = cookieStore.getAll();
        return allCookies.map(cookie => ({ name: cookie.name, value: cookie.value }));
      },
      setAll(cookiesToSet: Array<{ name: string; value: string; options: CookieOptions }>) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            const cookieOptionsWithDefaults = { ...options, path: options.path || '/' };
            cookieStore.set(name, value, cookieOptionsWithDefaults);
          });
        } catch (error: unknown) {
          let errorMessage = "An error occurred while setting cookies in createAdminServerClient.";
          if (error instanceof Error) {
            errorMessage = error.message;
          } else if (typeof error === 'string') {
            errorMessage = error;
          }
          console.warn(`(AdminClient) Error in 'setAll' cookie method: ${errorMessage}.`);
        }
      },
    },
  });
}
