import { createServerClient } from '@supabase/ssr';

import { NextResponse } from 'next/server';

import type { NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  console.log(`[Middleware] Processing path: ${request.nextUrl.pathname}`);
  const response = NextResponse.next();
  const url = request.nextUrl;
  const path = url.pathname;

  // Create a Supabase client configured to use cookies
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: any) {
          request.cookies.set({ name, value, ...options });
          response.cookies.set({ name, value, ...options });
        },
        remove(name: string, options: any) {
          request.cookies.delete(name);
          response.cookies.delete(name);
        },
      },
    }
  );

  // Get the user's session
  const { data: { session } } = await supabase.auth.getSession();
  const isAuthPage = path === '/' || path === '/login' || path === '/signup';
  
  // If user is not signed in and the current path is not an auth page, redirect to login
  if (!session && !isAuthPage) {
    return NextResponse.redirect(new URL('/', request.url));
  }

  // If user is signed in and the current path is an auth page, redirect to dashboard
  if (session && isAuthPage) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|api/.*).*)',
  ],
};
