// src/app/api/campaigns/route.ts
import { createAdminServerClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import type { Database } from '@/types';

export const dynamic = 'force-dynamic';

export async function GET() {
  // FIX: Use the admin client to bypass RLS for fetching all campaigns.
  const supabase = await createAdminServerClient();

  try {
    const { data, error } = await supabase
      .from('campaigns')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching campaigns with admin client:', error);
      return NextResponse.json(
        { error: `Failed to fetch campaigns: ${error.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json(data);
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}

export async function POST(request: Request) {
  // FIX: Use the admin client for creating campaigns as well.
  const supabase = await createAdminServerClient();
  const campaignData = await request.json();

  try {
    // Note: User ID is still required in the table, but for this API,
    // we are acting as the system. We'll need to sort out user association later if needed.
    const { name, status, user_id } = campaignData;

    if (!name || !user_id) {
      return NextResponse.json(
        { error: 'Campaign name and user_id are required' },
        { status: 400 }
      );
    }

    const { data, error: dbError } = await supabase
      .from('campaigns')
      .insert([{ name, status: status || 'draft', user_id }])
      .select()
      .single();

    if (dbError) {
      console.error('Failed to create campaign:', dbError);
      return NextResponse.json(
        { error: `Failed to create campaign: ${dbError.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json(data, { status: 201 });
  } catch (error: any) {
    console.error('Error in POST /api/campaigns:', error);
    return NextResponse.json(
      { error: `Internal server error: ${error.message}` },
      { status: 500 }
    );
  }
}