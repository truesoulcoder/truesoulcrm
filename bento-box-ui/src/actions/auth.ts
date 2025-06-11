'use server';

import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';

// The type for cookieStore is inferred from `cookies()` from `next/headers`.
// We don't need ActualCookieStoreType if using App Router's `cookies()` directly.

export async function signOut() {
  // cookies() from next/headers in Server Actions is async, so await it.
  const cookieStore = await cookies();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          try {
            cookieStore.set(name, value, options);
          } catch (error) {
            // The `set` method might be called from a Server Component context
            // where it's read-only. Supabase SSR handles this.
            // console.warn(`Failed to set cookie '${name}'. This is often benign in SSR.`, error);
          }
        },
        remove(name: string, options: CookieOptions) {
          try {
            // To remove a cookie, set its value to empty and expire it.
            cookieStore.set(name, '', { ...options, maxAge: 0 });
          } catch (error) {
            // Similar to `set`, `remove` (which uses `set`) might be called in a read-only context.
            // console.warn(`Failed to remove cookie '${name}'. This is often benign in SSR.`, error);
          }
        },
      },
    }
  );

  const { error } = await supabase.auth.signOut();

  if (error) {
    console.error('Error signing out:', error);
    // Return a more structured error object
    return {
      success: false,
      error: {
        message: error.message,
        name: error.name,
        status: (error as any).status, // Attempt to get status if available
      },
    };
  }

  // Optionally, redirect or return a success indicator.
  // If redirecting, ensure the function's return type reflects that it might not return anything useful here.
  // import { redirect } from 'next/navigation';
  // redirect('/login');
  return { success: true };
}
