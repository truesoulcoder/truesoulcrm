// In middleware.ts
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  console.log(`Middleware triggered for URL: ${request.url}, Method: ${request.method}`);

  // Create response object with CORS headers
  const response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  // Set CORS headers for all responses
  const allowedOrigins = [
    'https://truesoulpartners.vercel.app',
    'http://localhost:3000'
  ];
  const origin = request.headers.get('origin');
  if (origin && allowedOrigins.includes(origin)) {
    response.headers.set('Access-Control-Allow-Origin', origin);
  }
  response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  response.headers.set('Access-Control-Allow-Headers', 'authorization, content-type');
  response.headers.set('Access-Control-Allow-Credentials', 'true');
  response.headers.set('Access-Control-Max-Age', '86400');

  // Handle OPTIONS requests immediately
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: response.headers
    });
  }

  // Skip middleware for static files only
  if (request.nextUrl.pathname.startsWith('/_next/') || 
      request.nextUrl.pathname.includes('.')) {
    return response;
  }

  console.log("Before calling createServerClient");
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          response.cookies.set({
            name,
            value,
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            path: '/',
            ...options
          });
        },
        remove(name: string, options: CookieOptions) {
          response.cookies.set({
            name,
            value: '',
            ...options,
            maxAge: 0
          });
        },
      },
    }
  );

  // Skip auth for login page
  if (request.nextUrl.pathname === '/') {
    return response;
  }

  console.log("After createServerClient, before supabase.auth.getUser()");
  const { data: { user }, error } = await supabase.auth.getUser();
  console.log("After supabase.auth.getUser(), user:", user ? user.id : 'null', "error:", error ? error.message : 'null');

  // Redirect to login if not authenticated
  if (!user) {
    console.log('No user found, redirecting to login');
    const url = new URL('/', request.url);
    return NextResponse.redirect(url);
  }

  console.log("End of middleware, before returning response");
  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
}