// src/lib/dashboard/data.ts
import { supabase } from '../supabase/client';

export async function getTotalLeads(): Promise<number> {
  // FIX: The main table for properties/leads is `properties`.
  const { error, count } = await supabase
    .from('properties')
    .select('*', { count: 'exact', head: true });

  if (error) {
    console.error('Error fetching total leads:', error);
    throw new Error(`Error fetching total leads: ${error.message}`);
  }
  return count ?? 0;
}

export async function getActiveCampaigns(): Promise<number> {
  // This function is correct as the 'campaigns' table exists.
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

export async function getEmailsSent(): Promise<number> {
  // FIX: Query the `daily_email_metrics` view which exists in the schema.
  const { data, error } = await supabase
    .from('daily_email_metrics')
    .select('sent');

  if (error) {
    console.error('Error fetching emails sent:', error);
    throw new Error(`Error fetching emails sent: ${error.message}`);
  }

  // Sum the 'sent' count from all daily records.
  return data?.reduce((sum, record) => sum + (record.sent || 0), 0) ?? 0;
}

export async function getOpenRate(): Promise<number> {
  // FIX: Query the `daily_email_metrics` view and calculate the overall open rate.
  const { data, error } = await supabase
    .from('daily_email_metrics')
    .select('opened, delivered');

  if (error) {
    console.error('Error fetching open rate data:', error);
    throw new Error(`Error fetching open rate data: ${error.message}`);
  }

  if (!data || data.length === 0) return 0;

  const totals = data.reduce(
    (acc, record) => {
      acc.opened += record.opened || 0;
      acc.delivered += record.delivered || 0;
      return acc;
    },
    { opened: 0, delivered: 0 }
  );

  if (totals.delivered === 0) return 0;

  const overallOpenRate = (totals.opened / totals.delivered) * 100;

  return parseFloat(overallOpenRate.toFixed(1)); // e.g., 12.3 for 12.3%
}