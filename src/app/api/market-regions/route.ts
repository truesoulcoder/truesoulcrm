// src/app/api/market-regions/route.ts
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies, type ReadonlyRequestCookies } from 'next/headers'; // Import ReadonlyRequestCookies
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const cookieStore = cookies();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            try {
              cookieStore.set(name, value, options);
            } catch (error) {
              // The `setAll` method was called from a Server Component.
              // This can be ignored if you have middleware refreshing user sessions.
              // console.error('Error in setAll for cookie:', name, error);
            }
          });
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
      return NextResponse.json({ error: `Error fetching market regions: ${error.message}` }, { status: 500 });
    }

    if (!marketRegions || marketRegions.length === 0) {
      return NextResponse.json({ error: 'No market regions found.' }, { status: 404 });
    }

    return NextResponse.json(marketRegions, { status: 200 });

  } catch (e: any) {
    console.error('Error in /api/market-regions GET handler:', e);
    return NextResponse.json({ error: e.message || 'An unexpected error occurred.' }, { status: 500 });
  }
}
