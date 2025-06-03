// src/app/api/market-regions/route.ts
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const cookieStore = cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
      },
    }
  );

  try {
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData?.user) {
      console.error('API Error: User not authenticated for fetching market regions.', userError);
      return NextResponse.json({ ok: false, error: 'User not authenticated.' }, { status: 401 });
    }

    console.log('API: Attempting to fetch distinct market regions from normalized_leads...');

    const { data, error } = await supabase
      .from('normalized_leads')
      .select('market_region', { count: 'exact', head: false, distinct: true })
      .not('market_region', 'is', null) // Ensure we don't get null market regions
      .order('market_region', { ascending: true });

    if (error) {
      console.error('API Error: Failed to fetch distinct market regions:', error);
      return NextResponse.json(
        { ok: false, error: 'Failed to fetch market regions.', details: error.message },
        { status: 500 }
      );
    }

    const marketRegions = data ? data.map(item => item.market_region) : [];
    console.log('API: Distinct market regions fetched successfully:', marketRegions);
    return NextResponse.json({ ok: true, marketRegions }, { status: 200 });

  } catch (error: any) {
    console.error('API: Unhandled error in GET /api/market-regions:', error);
    return NextResponse.json(
      { ok: false, error: 'An unexpected error occurred.', details: error.message },
      { status: 500 }
    );
  }
}
