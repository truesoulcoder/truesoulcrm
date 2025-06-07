// src/app/api/engine/start-campaign/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createAdminServerClient } from '@/lib/supabase/server';
import { Database } from '@/db_types'; // Assuming db_types.ts is updated

export async function POST(request: NextRequest) {
  const supabase = await createAdminServerClient<Database>();

  let requestBody;
  try {
    requestBody = await request.json();
  } catch (error) {
    console.error('Error parsing JSON request body:', error);
    return NextResponse.json({ success: false, error: 'Invalid JSON body.' }, { status: 400 });
  }

  const { campaign_id, market_region } = requestBody;

  if (!campaign_id) {
    return NextResponse.json({ success: false, error: 'campaign_id is required.' }, { status: 400 });
  }
  if (!market_region) {
    return NextResponse.json({ success: false, error: 'market_region is required.' }, { status: 400 });
  }
  // Optional: Validate campaign_id (UUID) and market_region (text) formats if needed

  try {
    // 1. Call the schedule_campaign RPC function
    console.log(`Calling RPC schedule_campaign for campaign_id: ${campaign_id}, market_region: ${market_region}`);
    const { data: rpcData, error: rpcError } = await supabase.rpc('schedule_campaign', {
      p_campaign_id: campaign_id,
      p_market_region: market_region,
    });

    if (rpcError) {
      console.error(`Error calling schedule_campaign for campaign ${campaign_id}, market ${market_region}:`, rpcError);
      return NextResponse.json(
        { success: false, error: `RPC error scheduling campaign: ${rpcError.message}` },
        { status: 500 }
      );
    }
    // Assuming rpcData might be a simple object like { message: "Scheduled X jobs." } or just a success indicator
    const rpcMessage = (rpcData as any)?.message || 'Campaign jobs scheduled successfully.';
    console.log(`RPC schedule_campaign successful for campaign ${campaign_id}. Response: ${rpcMessage}`);

    // 2. Upsert the campaign_engine_state table
    console.log(`Upserting campaign_engine_state for campaign_id: ${campaign_id} to 'running'`);
    const { data: engineStateData, error: stateError } = await supabase
      .from('campaign_engine_state')
      .upsert(
        {
          campaign_id: campaign_id,
          status: 'running',
          paused_at: null,
          updated_at: new Date().toISOString(),
          // Assuming 'created_at' is handled by db default or trigger if it exists
          // and 'last_processed_job_id', 'current_job_started_at' are not set here
        },
        { 
          onConflict: 'campaign_id',
          // ignoreDuplicates: false, // default is false, ensures update if conflict
        }
      )
      .select()
      .single();

    if (stateError) {
      console.error(`Error upserting campaign_engine_state for campaign ${campaign_id}:`, stateError);
      return NextResponse.json(
        { success: false, error: `Failed to update campaign engine state: ${stateError.message}` },
        { status: 500 }
      );
    }
    console.log(`Campaign ${campaign_id} engine state updated to 'running'. State data:`, engineStateData);

    return NextResponse.json({
      success: true,
      message: rpcMessage,
      details: 'Campaign is now set to running and jobs are scheduled.',
      campaign_id: campaign_id,
      engine_state: engineStateData,
    });

  } catch (error: any) {
    console.error(`Unexpected error in start-campaign handler for campaign_id ${campaign_id}:`, error);
