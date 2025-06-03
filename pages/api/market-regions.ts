// pages/api/market-regions.ts
import { createClient } from '@supabase/supabase-js';
import { NextApiRequest, NextApiResponse } from 'next';

// Utility function to get Supabase client (assuming a similar setup as test-email.ts)
// You might need to adjust this based on your actual Supabase client initialization
const getSupabaseClient = () => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Supabase URL or Anon Key is not defined in environment variables.');
  }
  return createClient(supabaseUrl, supabaseAnonKey);
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  const supabase = getSupabaseClient();

  try {
    const { data: marketRegions, error } = await supabase
      .from('market_regions')
      .select('id, name, normalized_name, lead_count') // Selected fields
      .order('name', { ascending: true }); // Optional: order by name

    if (error) {
      console.error('Supabase error fetching market regions:', error);
      return res.status(500).json({ error: `Error fetching market regions: ${error.message}` });
    }

    if (!marketRegions) {
      return res.status(404).json({ error: 'No market regions found.' });
    }

    return res.status(200).json(marketRegions);
  } catch (e: any) {
    console.error('Error in /api/market-regions handler:', e);
    return res.status(500).json({ error: e.message || 'An unexpected error occurred.' });
  }
}
