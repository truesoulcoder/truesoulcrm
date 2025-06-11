// src/app/api/engine/stop-campaign/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createAdminServerClient } from '@/lib/supabase/server';
import type { Database } from '@/types';

/**
 * Pauses a running campaign by setting its status to 'paused' and recording the timestamp.
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
    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from('campaign_engine_state')
      .update({
        status: 'paused',
        paused_at: now,
        updated_at: now,
      })
      .eq('campaign_id', campaign_id)
      .eq('status', 'running') // Only stop campaigns that are currently running
      .select()
      .single();

    if (error) {
      // This error code means no row was found that matched the criteria (e.g., campaign not running or doesn't exist)
      if (error.code === 'PGRST116') {
        return NextResponse.json(
          { success: false, error: `Campaign with ID ${campaign_id} not found or is not currently running.` },
          { status: 404 }
        );
      }
      console.error(`Error pausing campaign ${campaign_id}:`, error);
      return NextResponse.json({ success: false, error: `Supabase error: ${error.message}` }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: `Campaign ${campaign_id} has been paused.`,
      data: data,
    });

  } catch (e: any) {
    console.error(`Unexpected error in stop-campaign handler for campaign_id ${campaign_id}:`, e);
    return NextResponse.json({ success: false, error: e.message || 'An unknown error occurred.' }, { status: 500 });
  }
}