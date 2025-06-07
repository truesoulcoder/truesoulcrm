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

  // Optional: Validate campaign_id format (e.g., UUID)
  // Example: if (!/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(campaign_id)) {
  //   return NextResponse.json({ success: false, error: 'Invalid campaign_id format.' }, { status: 400 });
  // }

  try {
    const { data, error } = await supabase
      .from('campaign_engine_state')
      .update({
        status: 'paused', // Setting to 'paused' as per plan
        paused_at: new Date().toISOString(),
        updated_at: new Date().toISOString(), // Also update updated_at
      })
      .eq('campaign_id', campaign_id)
      .select()
      .single(); // Use single to ensure we expect one row or handle if not found

    if (error) {
      if (error.code === 'PGRST116') { // PostgREST error for "No rows found"
        console.warn(`No campaign_engine_state record found for campaign_id: ${campaign_id} to stop.`);
        // Decide if this is an error or if an upsert is preferred.
        // For now, returning an error if no record was found to update.
        // Alternatively, you could upsert a new record:
        // const { data: upsertData, error: upsertError } = await supabase
        //   .from('campaign_engine_state')
        //   .upsert({ campaign_id: campaign_id, status: 'paused', paused_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        //   .select().single();
        // (handle upsertError) ...
        return NextResponse.json(
          { success: false, error: `Campaign with ID ${campaign_id} not found in engine state or already stopped/paused.` },
          { status: 404 } 
        );
      }
      console.error(`Error pausing campaign ${campaign_id}:`, error);
      return NextResponse.json(
        { success: false, error: `Supabase error: ${error.message}` },
        { status: 500 }
      );
    }
    
    if (!data) {
        // This case should ideally be caught by error.code === 'PGRST116' if .single() is used
        console.warn(`No campaign_engine_state record updated for campaign_id: ${campaign_id}. It might not exist.`);
        return NextResponse.json(
          { success: false, error: `Campaign with ID ${campaign_id} not found in engine state.` },
          { status: 404 }
        );
    }

    console.log(`Campaign ${campaign_id} paused successfully. State data:`, data);
    return NextResponse.json({
      success: true,
      message: `Campaign ${campaign_id} has been paused.`,
      data: data,
    });

  } catch (error: any) {
    console.error(`Unexpected error in stop-campaign handler for campaign_id ${campaign_id}:`, error);
    return NextResponse.json(
      { success: false, error: error.message || 'An unknown error occurred.' },
      { status: 500 }
    );
  }
}
