// src/app/api/engine/resume-campaign/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createAdminServerClient } from '@/lib/supabase/server';
import type { Database } from '@/types';

/**
 * Resumes a paused campaign.
 * It first calls an RPC function to adjust future job schedules, then updates the state to 'running'.
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
    // 1. Call the RPC function to adjust the schedule of pending jobs.
    const { data: rpcData, error: rpcError } = await supabase.rpc('adjust_schedule_on_resume', {
      campaign_id_to_resume: campaign_id,
    });

    if (rpcError) {
      console.error(`Error calling adjust_schedule_on_resume for campaign ${campaign_id}:`, rpcError);
      return NextResponse.json({ success: false, error: `RPC error: ${rpcError.message}` }, { status: 500 });
    }

    // 2. Update the campaign state to 'running' and clear the 'paused_at' timestamp.
    const { data: updateData, error: updateError } = await supabase
      .from('campaign_engine_state')
      .update({
        status: 'running',
        paused_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq('campaign_id', campaign_id)
      .eq('status', 'paused') // Only resume campaigns that are actually paused
      .select()
      .single();

    if (updateError) {
      if (updateError.code === 'PGRST116') {
        return NextResponse.json(
          { success: false, error: `Campaign with ID ${campaign_id} not found or was not in a paused state.` },
          { status: 404 }
        );
      }
      console.error(`Error updating campaign state for ${campaign_id} to running:`, updateError);
      return NextResponse.json({ success: false, error: `Failed to update campaign state: ${updateError.message}` }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: `Campaign ${campaign_id} resumed successfully. ${rpcData || 'Schedule adjusted.'}`,
      data: updateData,
    });

  } catch (e: any) {
    console.error(`Unexpected error in resume-campaign handler for campaign_id ${campaign_id}:`, e);
    return NextResponse.json({ success: false, error: e.message || 'An unknown error occurred.' }, { status: 500 });
  }
}