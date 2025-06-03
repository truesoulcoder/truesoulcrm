import { NextRequest, NextResponse } from 'next/server';
import { createAdminServerClient } from '@/lib/supabase/server';

const STATUS_KEY = 'campaign_processing_enabled';

export async function POST(request: NextRequest) {
  const supabase = await createAdminServerClient();

  try {
    // Attempt to update the flag. If the row doesn't exist, upsert it.
    // Upsert ensures that if the row for STATUS_KEY doesn't exist, it's created.
    const { data, error } = await supabase
      .from('eli5_engine_status')
      .upsert(
        { status_key: STATUS_KEY, is_enabled: true, updated_at: new Date().toISOString() },
        { onConflict: 'status_key', ignoreDuplicates: false } // Make sure to update if it exists
      )
      .select(); // Optionally select the data to confirm

    if (error) {
      console.error('Error updating campaign status to RESUME:', error);
      return NextResponse.json(
        { success: false, error: `Supabase error: ${error.message}` },
        { status: 500 }
      );
    }

    console.log(`Resume campaign signal processed. Status key '${STATUS_KEY}' set to true. Data:`, data);
    return NextResponse.json({ 
      success: true, 
      message: 'Campaign processing has been signaled to resume. New campaign batches can now start (if they check this flag).' 
    });

  } catch (error: any) {
    console.error('Unexpected error in resume-campaign handler:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'An unknown error occurred.' },
      { status: 500 }
    );
  }
}
