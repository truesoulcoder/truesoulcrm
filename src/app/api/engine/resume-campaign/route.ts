import { NextRequest, NextResponse } from 'next/server';
import { createAdminServerClient } from '@/lib/supabase/server';
import { Database } from '@/db_types'; // Assuming db_types.ts includes campaign_engine_state

export async function POST(request: NextRequest) {
  const supabase = await createAdminServerClient<Database>();

  let requestBody;
  try {
    requestBody = await request.json();
  } catch (error) {
    console.error('Error parsing JSON request body:', error);
    return NextResponse.json({ success: false, error: 'Invalid JSON body.' }, { status: 400 });
  }

  const { campaign_id } = requestBody;

  if (!campaign_id) {
    return NextResponse.json({ success: false, error: 'campaign_id is required.' }, { status: 400 });
  }

  // Optional: Validate campaign_id format

  try {
    // 1. Call the adjust_schedule_on_resume RPC function
    console.log(`Calling RPC adjust_schedule_on_resume for campaign_id: ${campaign_id}`);
    const { data: rpcData, error: rpcError } = await supabase.rpc('adjust_schedule_on_resume', {
      campaign_id_to_resume: campaign_id,
    });

    if (rpcError) {
      console.error(`Error calling adjust_schedule_on_resume for campaign ${campaign_id}:`, rpcError);
      return NextResponse.json(
        { success: false, error: `RPC error: ${rpcError.message}` },
        { status: 500 }
      );
    }
    console.log(`RPC adjust_schedule_on_resume successful for campaign ${campaign_id}. Response:`, rpcData);
    // rpcData might contain a message or status, e.g., { success: true, message: "Schedule adjusted" }

    // 2. Update the campaign_engine_state table
    const { data: updateData, error: updateError } = await supabase
      .from('campaign_engine_state')
      .update({
        status: 'running',
        paused_at: null, // Clear paused_at timestamp
        updated_at: new Date().toISOString(),
      })
      .eq('campaign_id', campaign_id)
      .select()
      .single();

    if (updateError) {
      if (updateError.code === 'PGRST116') { // No rows found
         console.warn(`No campaign_engine_state record found for campaign_id: ${campaign_id} to resume. This is unexpected if RPC succeeded.`);
         return NextResponse.json(
          { success: false, error: `Campaign with ID ${campaign_id} not found in engine state for update after RPC.` },
          { status: 404 } 
        );
      }
      console.error(`Error updating campaign_engine_state for campaign ${campaign_id} to running:`, updateError);
      return NextResponse.json(
        { success: false, error: `Failed to update campaign state: ${updateError.message}` },
        { status: 500 }
      );
    }

    if (!updateData) {
        console.warn(`No campaign_engine_state record updated for campaign_id: ${campaign_id} after RPC. It might not exist.`);
        return NextResponse.json(
          { success: false, error: `Campaign with ID ${campaign_id} not found in engine state for update.` },
          { status: 404 }
        );
    }
    
    const rpcMessage = (rpcData as any)?.message || 'Schedule adjusted and campaign resumed.';

    console.log(`Campaign ${campaign_id} resumed successfully. State data:`, updateData);
    return NextResponse.json({
      success: true,
      message: rpcMessage,
      data: updateData,
    });

  } catch (error: any) {
    console.error(`Unexpected error in resume-campaign handler for campaign_id ${campaign_id}:`, error);
    return NextResponse.json(
      { success: false, error: error.message || 'An unknown error occurred.' },
      { status: 500 }
    );
  }
}
