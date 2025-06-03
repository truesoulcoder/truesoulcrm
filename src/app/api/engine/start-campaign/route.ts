import fs from 'fs/promises';
import path from 'path';

import { SupabaseClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { configure, renderString } from 'nunjucks';

import { generateOfferDetails, OfferDetails } from '@/actions/offerCalculations';
import { createAdminServerClient } from '@/lib/supabase/server';
import { sendEmail } from '@/services/gmailService';
import { generateLoiPdf, PersonalizationData } from '@/services/pdfService';
import { FineCutLead } from '@/types/leads';

// Define a type for the log entry for cleaner code, matching email_log structure
interface EmailLogEntry {
  id?: number; 
  original_lead_id?: string;
  contact_name?: string;
  contact_email?: string;
  sender_name?: string;
  sender_email_used?: string;
  email_subject_sent?: string;
  email_body_preview_sent?: string;
  email_status?: string; 
  email_error_message?: string | null;
  email_sent_at?: string | null; 
  campaign_id?: string;
  campaign_run_id?: string; 
  created_at?: string; 
  is_converted_status_updated_by_webhook?: boolean | null;
  property_address?: string;
  property_city?: string;
  property_state?: string;
  property_postal_code?: string;
  property_type?: string;
  baths?: number | string;
  beds?: number | string;
  year_built?: number | string;
  square_footage?: number | string;
  assessed_total?: number | string;
  market_region?: string;
  mls_curr_status?: string;
  mls_curr_days_on_market?: number | string;
  [key: string]: any; 
}

// Define the structure for market-specific lead data
interface MarketSpecificLead {
  id: number | string;
  contact_name?: string;
  contact_email?: string;
  property_address?: string;
  property_city?: string;
  property_state?: string;
  property_postal_code?: string;
  // property_zipcode and zip_code are deprecated, use property_postal_code
  property_type?: string;
  baths?: number | string;
  beds?: number | string;
  year_built?: number | string;
  square_footage?: number | string;
  assessed_total?: number | string;
  mls_curr_status?: string;
  mls_curr_days_on_market?: number | string;
  email_sent?: string | null;
  // assessed_total is crucial for offer calculation
  [key: string]: any;
}

// Update the template directory path for App Router
const templateDir = path.join(process.cwd(), 'src', 'app', 'api', 'engine', 'templates');
configure(templateDir, { autoescape: true });

// Sender management
let senders: Array<{id: string, name: string, email: string, daily_limit: number, sent_today: number}> = [];
let currentSenderIndex = 0;

// Function to fetch and update senders from the database
async function updateSendersFromDB(supabase: SupabaseClient) {
  try {
    const { data, error } = await supabase
      .from('senders')
      .select('id, name, email, daily_limit, sent_today')
      .eq('is_active', true)
      .order('sent_today', { ascending: true });

    if (error) {
      console.error('Error fetching senders:', error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error('Exception when fetching senders:', error);
    return [];
  }
}

// Function to get the next available sender
async function getNextSender(supabase: SupabaseClient) {
  // Refresh senders from DB to get latest counts
  senders = await updateSendersFromDB(supabase);
  
  if (senders.length === 0) {
    throw new Error('No active senders found in the database');
  }

  // Find a sender that hasn't exceeded their daily limit
  for (let i = 0; i < senders.length; i++) {
    const sender = senders[currentSenderIndex % senders.length];
    currentSenderIndex++;
    
    if (sender.sent_today < sender.daily_limit) {
      return sender;
    }
  }

  // If all senders have hit their daily limit, return the one with the least sends
  senders.sort((a, b) => (a.sent_today || 0) - (b.sent_today || 0));
  return senders[0];
}

// Function to increment the sent count for a sender
async function incrementSenderSentCount(supabase: SupabaseClient, senderId: string) {
  try {
    const { error } = await supabase.rpc('increment_sender_sent_count', {
      sender_id: senderId
    });

    if (error) {
      console.error('Error incrementing sender sent count:', error);
    }
  } catch (error) {
    console.error('Exception when incrementing sender sent count:', error);
  }
}

async function logInitialAttempt(
  supabase: SupabaseClient,
  logData: Partial<EmailLogEntry>
): Promise<number | null> {
  try {
    const { data, error } = await supabase
      .from('email_log')
      .insert({ ...logData, email_status: logData.email_status || 'PENDING_PROCESSING' }) // Default if not provided
      .select('id')
      .single();

    if (error) {
      console.error('Failed to log initial attempt to Supabase:', error);
      throw error; 
    }
    if (!data || !data.id) {
        console.error('Failed to log initial attempt to Supabase: No ID returned');
        throw new Error('Failed to log initial attempt: No ID returned');
    }
    return data.id as number;
  } catch (error) {
    console.error('Error in logInitialAttempt:', error);
    throw error;
  }
}

async function updateEmailLogStatus(
  supabase: SupabaseClient,
  logId: number,
  status: string,
  sentAt: string | null = null,
  errorMessage: string | null = null,
  isConvertedStatus: boolean | null = null
): Promise<void> {
  const updateData: Partial<EmailLogEntry> = {
    email_status: status,
    email_sent_at: sentAt,
    email_error_message: errorMessage,
  };
  if (isConvertedStatus !== null) {
    updateData.is_converted_status_updated_by_webhook = isConvertedStatus;
  }

  try {
    const { error } = await supabase
      .from('email_log')
      .update(updateData)
      .eq('id', logId);

    if (error) {
      console.error(`Failed to update email log status for log ID ${logId}:`, error);
    }
  } catch (error) {
    console.error(`Error in updateEmailLogStatus for log ID ${logId}:`, error);
  }
}

// Helper function to validate email
const isValidEmail = (email: string): boolean => {
  if (!email) {
    return false;
  }
  // Basic regex for email validation
  const pattern = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  return pattern.test(email);
};

interface StartCampaignRequestBody {
  market_region: string;
  limit_per_run?: number;
  campaign_id?: string; 
  campaign_run_id?: string; 
}

export async function POST(request: NextRequest) {
  let requestBody;
  try {
    requestBody = await request.json();
  } catch (error) {
    return NextResponse.json(
      { success: false, error: 'Invalid JSON in request body' },
      { status: 400 }
    );
  }

  const {
    market_region,
    limit_per_run = 10, // Default limit
    campaign_id = `campaign-${Date.now()}`, 
    campaign_run_id = `run-${Date.now()}` 
  }: StartCampaignRequestBody = requestBody;

  // Variables to hold the final response details
  let responseData: any = { success: true, message: "Campaign processing initiated. Final status will be reflected upon completion." }; // Default response
  let responseStatus: number = 200; // Default status

  if (!market_region || typeof market_region !== 'string') {
    return NextResponse.json(
      { success: false, error: 'market_region (string) is required.' },
      { status: 400 }
    );
  }
  if (typeof limit_per_run !== 'number' || limit_per_run <= 0) {
    return NextResponse.json(
      { success: false, error: 'limit_per_run (positive number) is invalid.' },
      { status: 400 }
    );
  }

  const supabase = await createAdminServerClient();
  let attemptedCount = 0;
  let successCount = 0;
  let failureCount = 0;
  const processingErrors: { lead_id: string, error: string }[] = [];
  let leads: FineCutLead[] = []; // Declare leads here to be accessible in the final catch/finally

  try {
    // Check if campaign processing is enabled
    const { data: statusData, error: statusError } = await supabase
      .from('engine_status')
      .select('is_enabled')
      .eq('status_key', 'campaign_processing_enabled')
      .single();

    if (statusError && statusError.code !== 'PGRST116') { // Not found is ok
      console.error('Error checking campaign processing status:', statusError);
      return NextResponse.json(
        { success: false, error: `Error checking campaign status: ${statusError.message}` },
        { status: 500 }
      );
    }

    // If status exists and is explicitly false, don't process
    if (statusData && statusData.is_enabled === false) {
      return NextResponse.json({
        success: false,
        message: 'Campaign processing is currently disabled. Use the resume-campaign endpoint to enable it.',
      });
    }

    // Get leads to process based on the market region
    // Get the normalized name for the market region
    const { data: marketRegionData, error: marketRegionError } = await supabase
      .from('market_regions')
      .select('normalized_name')
      .eq('name', market_region)
      .single();

    if (marketRegionError) {
      console.error('Error fetching market region data:', marketRegionError);
      return NextResponse.json(
        { success: false, error: `Error fetching market region: ${marketRegionError.message}` },
        { status: 500 }
      );
    }

    if (!marketRegionData || !marketRegionData.normalized_name) {
      return NextResponse.json(
        { success: false, error: `Market region "${market_region}" not found or has no normalized name.` },
        { status: 404 }
      );
    }

    const marketRegionNormalizedName = marketRegionData.normalized_name;
    const leadTableName = `${marketRegionNormalizedName}_fine_cut_leads`;

    // Query the market-specific lead table
    const { data: fetchedLeadsData, error: leadsFetchError } = await supabase
      .from(leadTableName)
      .select('*') // Consider selecting specific fields for FineCutLead if needed
      .is('email_sent', null)
      .neq('property_type', 'Vacant Land')
      .or('contact1_email_1.neq.null,contact2_email_1.neq.null,contact3_email_1.neq.null,mls_curr_list_agent_email.neq.null')
      .order('id', { ascending: true })
      .limit(limit_per_run);

    if (leadsFetchError) {
      console.error(`Error fetching leads from ${leadTableName}:`, leadsFetchError);
      // Throw an error to be caught by the main campaign catch block
      throw new Error(`Database error fetching leads: ${leadsFetchError.message}`);
    }

    if (fetchedLeadsData) {
      // Assign to the outer-scoped 'leads' variable.
      leads = fetchedLeadsData as FineCutLead[]; 
    }

    if (!leads || leads.length === 0) {
      return NextResponse.json({
        success: true,
        message: `No leads found for market region "${market_region}" that match the criteria.`,
        data: { attemptedCount: 0, successCount: 0, failureCount: 0, processingErrors: [] }
      });
    }

    // Simplified loop for diagnosis (TEMPORARY - will be replaced next)
    console.log('Leads fetched. Entering simplified diagnostic loop. Leads count:', leads.length);
    for (const lead of leads) {
      attemptedCount++;
      try {
        console.log(`DIAG: Processing lead ID: ${lead.id}`);
        // Simulate some work
        if (Math.random() < 0.05) { // Simulate a rare error for some leads
          throw new Error(`Simulated processing error for lead ${lead.id}`);
        }
        successCount++;
      } catch (error: any) {
        failureCount++;
        processingErrors.push({
          lead_id: lead.id ? lead.id.toString() : 'DIAG_UNKNOWN_ID',
          error: `DIAG_ERROR: ${error.message}`
        });
        console.error(`DIAG_ERROR processing lead ID ${lead.id}:`, error);
      }
    } // End of simplified for...of loop for leads
    // Main campaign logic completed, now prepare response data
    // This block is now outside the loop, but still within the main try block.
    const overallSuccess = failureCount === 0 && processingErrors.every(e => e.lead_id !== 'CAMPAIGN_LEVEL_ERROR');
    responseData = {
      success: overallSuccess,
      message: `Campaign processing completed. Attempted: ${attemptedCount}, Success: ${successCount}, Failure: ${failureCount}`,
      data: {
        attemptedCount,
        successCount,
        failureCount,
        processingErrors,
      },
    };
    responseStatus = 200; // API call itself was successful, payload indicates operational success/failure
  } catch (campaignLevelError: any) {
    // This catch handles errors from the main campaign logic (e.g., DB errors, status checks)
    console.error('Critical error during campaign processing run:', campaignLevelError);
    // Update failureCount and processingErrors to reflect a campaign-wide failure
    // If leads array was populated, count them as failures, otherwise it's a more general campaign setup error.
    failureCount = leads.length > 0 ? leads.length : (attemptedCount > 0 ? attemptedCount : limit_per_run); 
    processingErrors.push({ 
      lead_id: 'CAMPAIGN_LEVEL_ERROR', 
      error: `Critical campaign error: ${campaignLevelError.message || 'Unknown error'}` 
    });
      // Construct error response for campaign-level failure
      responseData = {
        success: false,
        message: `Critical campaign error: ${campaignLevelError.message || 'Unknown error'}`,
        data: {
          attemptedCount,
          successCount,
          failureCount, // This was updated just before
          processingErrors, // This was updated just before
        },
        error: campaignLevelError.message || 'Unknown error',
      };
      responseStatus = 500; // Internal Server Error
    // Do not return here; let the finally block handle the response.
  } finally {
    // This block ALWAYS executes for cleanup.
    console.log(`Campaign run ${campaign_run_id} summary: Attempted: ${attemptedCount}, Succeeded: ${successCount}, Failed: ${failureCount}`);
    // Response is now constructed in try/catch and returned after this finally block.
  } // End of finally block

  // Ensure responseData and responseStatus are declared and set in the try/catch blocks above.
  // For example, declare near the start of the POST function:
  // let responseData: any;
  // let responseStatus: number = 200; // Default status
  // Then, in the try block (on success):
  //   responseData = { success: true, ... }; 
  //   responseStatus = 200;
  // And in the catch (campaignLevelError) block:
  //   responseData = { success: false, error: campaignLevelError.message, ... }; 
  //   responseStatus = 500;

  // responseData and responseStatus are assigned in the try/catch blocks above.
  return NextResponse.json(responseData, { status: responseStatus });
}
