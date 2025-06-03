import { getSupabaseClient } from './_utils';
import type { NextApiRequest, NextApiResponse } from 'next';

const STATUS_KEY = 'campaign_processing_enabled';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  const supabase = getSupabaseClient();

  try {
    // Attempt to update the flag. If the row doesn't exist, upsert it.
    // Upsert ensures that if the row for STATUS_KEY doesn't exist, it's created.
    const { data, error } = await supabase
      .from('eli5_engine_status')
      .upsert(
        { status_key: STATUS_KEY, is_enabled: false, updated_at: new Date().toISOString() },
        { onConflict: 'status_key', ignoreDuplicates: false } // Make sure to update if it exists
      )
      .select(); // Optionally select the data to confirm

    if (error) {
      console.error('Error updating campaign status to STOP:', error);
      return res.status(500).json({ success: false, error: `Supabase error: ${error.message}` });
    }

    console.log(`Stop campaign signal processed. Status key '${STATUS_KEY}' set to false. Data:`, data);
    return res.status(200).json({ 
      success: true, 
      message: 'Campaign processing has been signaled to stop. New campaign batches will not start (if they check this flag).' 
    });

  } catch (error: any) {
    console.error('Unexpected error in stop-campaign handler:', error);
    return res.status(500).json({ success: false, error: error.message || 'An unknown error occurred.' });
  }
}
