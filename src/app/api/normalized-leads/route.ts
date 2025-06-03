// src/app/api/normalized-leads/route.ts
import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  console.log('API: /api/normalized-leads GET request received.');

  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { searchParams } = new URL(request.url);
  const page = parseInt(searchParams.get('page') || '1', 10);
  const pageSize = parseInt(searchParams.get('pageSize') || '25', 10);
  const marketRegion = searchParams.get('market_region') || null;

  if (isNaN(page) || page < 1) {
    return NextResponse.json({ ok: false, error: 'Invalid page number.' }, { status: 400 });
  }
  if (isNaN(pageSize) || ![10, 25, 50, 100].includes(pageSize)) {
    return NextResponse.json({ ok: false, error: 'Invalid page size. Must be 10, 25, 50, or 100.' }, { status: 400 });
  }

  const from = (page - 1) * pageSize;
  const to = page * pageSize - 1;

  console.log(`API: Fetching normalized_leads page: ${page}, pageSize: ${pageSize}, from: ${from}, to: ${to}, marketRegion: ${marketRegion}`);

  try {
    let query = supabaseAdmin
      .from('normalized_leads')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, to);

    // If marketRegion is provided and not 'all', filter leads by market_region
    if (marketRegion && marketRegion.toLowerCase() !== 'all') {
        query = query.eq('market_region', marketRegion);
    }

    const { data: leads, error, count } = await query;

    if (error) {
      console.error('API Error: Failed to fetch normalized leads:', error);
      return NextResponse.json(
        { ok: false, error: 'Failed to fetch normalized leads.', details: error.message },
        { status: 500 }
      );
    }

    console.log(`API: Successfully fetched ${leads?.length} leads. Total count: ${count}`);

    return NextResponse.json({
      ok: true,
      leads,
      totalCount: count,
      currentPage: page,
      pageSize,
      totalPages: count ? Math.ceil(count / pageSize) : 0,
    });

  } catch (error: any) {
    console.error('API: Unhandled error in GET /api/normalized-leads:', error);
    return NextResponse.json(
      { ok: false, error: 'An unexpected error occurred.', details: error.message },
      { status: 500 }
    );
  }
}