import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  // Skip middleware for static files
  if (request.nextUrl.pathname.startsWith('/_next/') || 
      request.nextUrl.pathname.includes('.') || 
      request.nextUrl.pathname.startsWith('/api')) {
    return NextResponse.next()
  }

  console.log(`Middleware triggered for URL: ${request.url}, Method: ${request.method}`);
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  })

  console.log("Before calling createServerClient");
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value
        },
        set(name: string, value: string, options) {
          request.cookies.set({ name, value, ...options })
          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          })
          response.cookies.set({ name, value, ...options })
        },
        remove(name: string, options) {
          request.cookies.set({ name, value: '', ...options })
          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          })
          response.cookies.delete({ name, ...options })
        },
      },
    }
  )

  console.log("After createServerClient, before supabase.auth.getUser()");
  const { data: { user }, error } = await supabase.auth.getUser();
  console.log("After supabase.auth.getUser(), user:", user, "error:", error);

  console.log("End of middleware, before returning response");
  return response
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
}