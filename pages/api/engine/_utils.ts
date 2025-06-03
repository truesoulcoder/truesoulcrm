// Core Node.js modules

// Third-party libraries
import { createClient } from '@supabase/supabase-js';
import { JWT } from 'google-auth-library';
import { google } from 'googleapis';

// Types
import type { SupabaseClient } from '@supabase/supabase-js';

// Type definitions
interface ServiceAccountCredentials {
  client_email: string;
  private_key: string;
  [key: string]: unknown;
}

// Supabase Client
let supabase: SupabaseClient | null = null;

export const getSupabaseClient = (): SupabaseClient => {
  if (supabase) {
    return supabase;
  }
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY; // Use service role key

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Supabase URL or Service Role Key is not defined in environment variables.');
  }
  supabase = createClient(supabaseUrl, supabaseKey);
  return supabase;
};

// Gmail Service
export const getGmailService = (userEmailToImpersonate: string): import('googleapis').gmail_v1.Gmail => {
  const serviceAccountKeyJson = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!serviceAccountKeyJson) {
    throw new Error('Google Service Account Key JSON is not defined in environment variables.');
  }

  let serviceAccountCredentials: ServiceAccountCredentials;
  try {
    const parsed = JSON.parse(serviceAccountKeyJson);
    // Ensure private_key newlines are handled if they come as literal \n
    if (parsed.private_key) {
      parsed.private_key = String(parsed.private_key).replace(/\\n/g, '\n');
    }
    serviceAccountCredentials = parsed as ServiceAccountCredentials;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`Failed to parse Google Service Account Key JSON: ${errorMessage}`);
  }

  // Create JWT client for Gmail API
  const jwtClient = new JWT({
    email: serviceAccountCredentials.client_email,
    key: serviceAccountCredentials.private_key,
    scopes: ['https://www.googleapis.com/auth/gmail.send'],
    subject: userEmailToImpersonate
  });

  const gmail = google.gmail({ version: 'v1', auth: jwtClient });
  return gmail;
};


// Logging to Supabase
export interface Eli5EmailLogEntry {
  id?: number; // Assuming BIGINT maps to number
  created_at?: string; // TIMESTAMPTZ

  original_lead_id?: string | null;
  contact_name?: string | null;
  contact_email?: string | null;

  property_address?: string | null;
  property_city?: string | null;
  property_state?: string | null;
  property_postal_code?: string | null;
  property_type?: string | null;
  baths?: number | null;
  beds?: number | null;
  year_built?: number | null;
  square_footage?: number | null;
  assessed_total?: number | null;
  market_region?: string | null;

  mls_curr_status?: string | null;
  mls_curr_days_on_market?: number | null;
  normalized_lead_converted_status?: boolean | null;

  sender_name?: string | null;
  sender_email_used?: string | null;
  email_subject_sent?: string | null;
  email_body_preview_sent?: string | null;
  email_status: string; // This is generally required
  email_error_message?: string | null;
  email_sent_at?: string | null; // ISO string for TIMESTAMPTZ

  campaign_id?: string | null;
  campaign_run_id?: string | null;

  converted?: boolean | null;

  [key: string]: any; // Retain for flexibility if extra fields are ever passed
}

export const logToSupabase = async (logData: Partial<Eli5EmailLogEntry>) => { // Changed to Partial for flexibility
  const client = getSupabaseClient();
  try {
    const { error } = await client.from('eli5_email_log').insert([logData]);
    if (error) {
      console.error('Failed to log to Supabase:', error);
      throw error;
    }
  } catch (error) {
    console.error('Error in logToSupabase:', error);
    // Decide if you want to re-throw or handle silently
  }
};

// Email Validation
export const isValidEmail = (email: string): boolean => {
  if (!email) {
    return false;
  }
  // Basic regex for email validation
  const pattern = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  return pattern.test(email);
};
