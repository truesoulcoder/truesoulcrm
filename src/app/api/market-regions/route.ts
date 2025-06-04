// src/app/api/market-regions/route.ts
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers'; 
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const cookieStore = await cookies(); // Get the cookie store from next/headers and await it

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string): string | undefined {
          const cookie = cookieStore.get(name);
          return cookie ? cookie.value : undefined;
        },
        set(name: string, value: string, options: CookieOptions) {
          try {
            const { domain, path, secure, httpOnly, maxAge, sameSite } = options;
            const setOptions: Record<string, any> = {};
            if (domain !== undefined) setOptions.domain = domain;
            if (path !== undefined) setOptions.path = path;
            if (secure !== undefined) setOptions.secure = secure;
            if (httpOnly !== undefined) setOptions.httpOnly = httpOnly;
            if (maxAge !== undefined) setOptions.maxAge = maxAge;
            if (sameSite !== undefined) setOptions.sameSite = sameSite as 'strict' | 'lax' | 'none';

            cookieStore.set({ name, value, ...setOptions });
          } catch (error: any) {
            // console.error('Error in set for cookie:', name, error);
          }
        },
        remove(name: string, options: CookieOptions) {
          try {
            const { domain, path, secure, httpOnly, sameSite } = options;
            const removeOptions: Record<string, any> = { maxAge: 0 }; // Key for removal
            if (domain !== undefined) removeOptions.domain = domain;
            if (path !== undefined) removeOptions.path = path;
            if (secure !== undefined) removeOptions.secure = secure;
            if (httpOnly !== undefined) removeOptions.httpOnly = httpOnly;
            if (sameSite !== undefined) removeOptions.sameSite = sameSite as 'strict' | 'lax' | 'none';
            
            cookieStore.set({ name, value: '', ...removeOptions });
          } catch (error: any) {
            // console.error('Error in remove for cookie:', name, error);
          }
        },
      },
    }
  );

  try {
    // Optional: If you need to ensure the user is authenticated to access this route
    // const { data: { user }, error: userError } = await supabase.auth.getUser();
    // if (userError || !user) {
    //   console.error('API Error: User not authenticated for fetching market regions.', userError);
    //   return NextResponse.json({ error: 'User not authenticated.' }, { status: 401 });
    // }

    const { data: marketRegions, error } = await supabase
      .from('market_regions')
      .select('id, name, normalized_name, lead_count') // Selected fields
      .order('name', { ascending: true }); // Optional: order by name

    if (error) {
      console.error('Supabase error fetching market regions:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      return NextResponse.json({ error: `Error fetching market regions: ${errorMessage}` }, { status: 500 });
    }

    if (!marketRegions || marketRegions.length === 0) {
      return NextResponse.json({ error: 'No market regions found.' }, { status: 404 });
    }

    return NextResponse.json(marketRegions, { status: 200 });

  } catch (e: unknown) { // Catch error as unknown for type safety
    console.error('Error in /api/market-regions GET handler:', e);
    const message = e instanceof Error ? e.message : 'An unexpected error occurred.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
