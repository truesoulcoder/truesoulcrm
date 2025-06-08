// src/app/api/engine/start-campaign/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createAdminServerClient } from '@/lib/supabase/server';
import type { Database } from '@/types';

/**
 * Starts a campaign by setting its status to 'running' in the campaign_engine_state table.
 * Note: This does not schedule jobs, it only "enables" a campaign that has already been set up.
 */
export async function POST(request: NextRequest) {
  const supabase = await createAdminServerClient<Database>();

  let requestBody;
  try {
    requestBody = await request.json();
  } catch (error) {
    return NextResponse.json({ success: false, error: 'Invalid JSON body.' }, { status: 400 });
  }

  const { campaign_id } = requestBody;

  if (!campaign_id) {
    return NextResponse.json({ success: false, error: 'campaign_id is required.' }, { status: 400 });
  }

  try {
    const { data, error } = await supabase
      .from('campaign_engine_state')
      .upsert(
        {
          campaign_id: campaign_id,
          status: 'running',
          paused_at: null, // Ensure paused_at is cleared when starting
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'campaign_id' }
      )
      .select()
      .single();

    if (error) {
      console.error(`Error starting campaign ${campaign_id}:`, error);
      return NextResponse.json(
        { success: false, error: `Failed to start campaign: ${error.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `Campaign ${campaign_id} has been started.`,
      data: data,
    });

  } catch (e: any) {
    console.error(`Unexpected error in start-campaign handler for campaign_id ${campaign_id}:`, e);
    return NextResponse.json({ success: false, error: e.message || 'An unknown error occurred.' }, { status: 500 });
  }
}