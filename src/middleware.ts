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
  response.headers.set('Access-Control-Allow-Origin', 'https://truesoulpartners.vercel.app');
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

  // Skip middleware for static files or API routes that don't need auth check
  if (request.nextUrl.pathname.startsWith('/_next/') ||
      request.nextUrl.pathname.includes('.') ||
      request.nextUrl.pathname.startsWith('/api')) {
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
          request.cookies.set({ name, value, ...options });
          response.cookies.set({ name, value, ...options });
        },
        remove(name: string, options: CookieOptions) {
          request.cookies.set({ name, value: '', ...options });
          response.cookies.delete(name, options);
        },
      },
    }
  );

  console.log("After createServerClient, before supabase.auth.getUser()");
  const { data: { user }, error } = await supabase.auth.getUser();
  console.log("After supabase.auth.getUser(), user:", user ? user.id : 'null', "error:", error ? error.message : 'null');

  // --- Auth Check Logic ---
  // Redirect to root (login page) if no user and not already on the login page
  if (!user && request.nextUrl.pathname !== '/') {
      const url = request.nextUrl.clone();
      url.pathname = '/';
      return NextResponse.redirect(url);
  }

  console.log("End of middleware, before returning response");
  return response;
}

export const config = {
  matcher: [
    // Include API routes that need auth
    '/((?!_next/static|_next/image|favicon.ico).*)',
    '/api/senders/:path*'
  ],
}