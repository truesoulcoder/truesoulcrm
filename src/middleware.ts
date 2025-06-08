import { createServerClient, type CookieOptions } from '@supabase/ssr' //
import { NextResponse, type NextRequest } from 'next/server' //

export async function middleware(request: NextRequest) { //
  console.log(`Middleware triggered for URL: ${request.url}, Method: ${request.method}`); //

  // Skip middleware for static files or API routes that don't need auth check
  if (request.nextUrl.pathname.startsWith('/_next/') || //
      request.nextUrl.pathname.includes('.') || //
      request.nextUrl.pathname.startsWith('/api')) { //
    return NextResponse.next(); //
  }

  // Always create a response object to modify and return at the end.
  // This is the SAME response object that will be used throughout the middleware.
  const response = NextResponse.next({ //
    request: { //
      headers: request.headers, //
    }, //
  }); //

  console.log("Before calling createServerClient"); //
  const supabase = createServerClient( //
    process.env.NEXT_PUBLIC_SUPABASE_URL!, //
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, //
    { //
      cookies: { //
        get(name: string) { //
          return request.cookies.get(name)?.value; //
        }, //
        // FIX: Modify the 'response' object directly, do NOT re-create it.
        set(name: string, value: string, options: CookieOptions) { //
          request.cookies.set({ name, value, ...options }); //
          response.cookies.set({ name, value, ...options }); //
        }, //
        // FIX: Modify the 'response' object directly, do NOT re-create it.
        remove(name: string, options: CookieOptions) { //
          request.cookies.set({ name, value: '', ...options }); //
          response.cookies.delete(name, options); //
        }, //
      }, //
    } //
  ); //

  console.log("After createServerClient, before supabase.auth.getUser()"); //
  const { data: { user }, error } = await supabase.auth.getUser(); //
  console.log("After supabase.auth.getUser(), user:", user ? user.id : 'null', "error:", error ? error.message : 'null'); //

  // --- Auth Check Logic ---
  // Redirect to root (login page) if no user and not already on the login page
  if (!user && request.nextUrl.pathname !== '/') { // FIX: Changed from '/login' to '/'
      const url = request.nextUrl.clone(); //
      url.pathname = '/'; // FIX: Changed from '/login' to '/'
      return NextResponse.redirect(url); //
  }

  console.log("End of middleware, before returning response"); //
  return response; //
}

export const config = { //
  matcher: [ //
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - . (any file with an extension, like .png, .jpg, .css, etc.)
     * - /api (your API routes, if you don't want them covered by this middleware)
     * - / (your root/login page)
     */
    '/((?!_next/static|_next/image|favicon.ico|api|).*)', // FIX: Removed 'login|' and ensuring root '/' is excluded from auth check
  ], //
}