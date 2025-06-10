// src/lib/dashboard/data.ts
import { supabase } from '../supabase/client'; // Adjusted path assuming supabase client is in src/lib/supabase/client.ts

export async function getTotalLeads(): Promise<number> {
  const { error, count } = await supabase
    .from('leads')
    .select('*', { count: 'exact', head: true });

  if (error) {
    console.error('Error fetching total leads:', error);
    throw new Error(`Error fetching total leads: ${error.message}`);
  }
  return count ?? 0;
}

export async function getActiveCampaigns(): Promise<number> {
  const { error, count } = await supabase
    .from('campaigns')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'active');

  if (error) {
    console.error('Error fetching active campaigns:', error);
    throw new Error(`Error fetching active campaigns: ${error.message}`);
  }
  return count ?? 0;
}

// Assuming a `campaign_stats` table or similar for these metrics.
// Adjust table and column names as per your actual schema.

export async function getEmailsSent(): Promise<number> {
  const { data, error } = await supabase
    .from('campaign_stats') // Replace if your table is different (e.g., 'email_activity_logs')
    .select('emails_sent'); // Replace if your column is different (e.g., 'sent_count')

  if (error) {
    console.error('Error fetching emails sent:', error);
    throw new Error(`Error fetching emails sent: ${error.message}`);
  }

  // This assumes 'emails_sent' is a numeric column in each record.
  // If 'emails_sent' is a summary on a campaign, or if you need to count rows in an email log,
  // the query and aggregation will be different.
  return data?.reduce((sum, record) => sum + (record.emails_sent || 0), 0) ?? 0;
}

export async function getOpenRate(): Promise<number> {
  const { data, error } = await supabase
    .from('campaign_stats') // Replace if your table is different
    .select('open_rate');   // Replace if your column is different

  if (error) {
    console.error('Error fetching open rate:', error);
    throw new Error(`Error fetching open rate: ${error.message}`);
  }

  if (!data || data.length === 0) return 0;

  // This calculates an average open rate from multiple records.
  // If 'open_rate' is a pre-calculated value or on a specific campaign record, adjust accordingly.
  const totalOpenRate = data.reduce((sum, record) => sum + (record.open_rate || 0), 0);
  const averageOpenRate = totalOpenRate / data.length;
  
  return parseFloat(averageOpenRate.toFixed(1)); // e.g., 12.3 for 12.3%
}
