import fs from 'fs/promises';
import path from 'path';

import { SupabaseClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { configure, renderString } from 'nunjucks';

import { createAdminServerClient } from '@/lib/supabase/server';
import { sendEmail, generateLoiPdf } from '@/services';


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
  property_zipcode?: string;
  zip_code?: string;
  property_type?: string;
  baths?: number | string;
  beds?: number | string;
  year_built?: number | string;
  square_footage?: number | string;
  assessed_total?: number | string;
  mls_curr_status?: string;
  mls_curr_days_on_market?: number | string;
  email_sent?: string | null;
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
    // Note: We need to update this query to use the market-specific lead tables
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
    const { data: leads, error: leadsError } = await supabase
      .from(leadTableName)
      .select('*')
      .is('email_sent', null)
      .neq('property_type', 'Vacant Land')
      .or('contact1_email_1.neq.null,contact2_email_1.neq.null,contact3_email_1.neq.null,mls_curr_list_agent_email.neq.null')
      .order('id', { ascending: true })
      .limit(limit_per_run) as { data: MarketSpecificLead[] | null, error: any };

    if (leadsError) {
      console.error(`Error fetching leads from ${leadTableName}:`, leadsError);
      return NextResponse.json(
        { success: false, error: `Error fetching leads: ${leadsError.message}` },
        { status: 500 }
      );
    }

    if (!leads || leads.length === 0) {
      return NextResponse.json({
        success: true,
        message: `No leads found for market region "${market_region}" that match the criteria.`,
        data: { attemptedCount: 0, successCount: 0, failureCount: 0, processingErrors: [] }
      });
    }

    // Load email template
    const emailTemplatePath = path.join(templateDir, 'email_body_with_subject.html');
    const emailTemplateContent = await fs.readFile(emailTemplatePath, 'utf8');

    // Process each lead
    for (const lead of leads) {
      attemptedCount++;
      
      try {
        // Get contact email - check multiple fields
        const contactEmail = lead.contact1_email_1 || lead.contact2_email_1 || lead.contact3_email_1 || lead.mls_curr_list_agent_email;
        
        if (!contactEmail || !isValidEmail(contactEmail)) {
          processingErrors.push({
            lead_id: lead.id ? lead.id.toString() : 'unknown',
            error: `Invalid or missing contact email for lead ID ${lead.id || 'unknown'}`
          });
          failureCount++;
          continue;
        }

        // Get sender
        const sender = await getNextSender(supabase);
        
        // Prepare personalization data
        // Convert numeric values to strings to match PersonalizationData interface requirements
        const personalizationData = {
          // Only include string properties or convert to string
          property_address: lead.property_address,
          property_city: lead.property_city,
          property_state: lead.property_state,
          property_postal_code: lead.property_postal_code || lead.zip_code || lead.property_zipcode,
          property_type: lead.property_type,
          baths: lead.baths?.toString(),
          beds: lead.beds?.toString(),
          year_built: lead.year_built?.toString(),
          square_footage: lead.square_footage?.toString(),
          assessed_total: lead.assessed_total?.toString(),
          mls_curr_status: lead.mls_curr_status,
          mls_curr_days_on_market: lead.mls_curr_days_on_market?.toString(),
          contact_name: lead.contact_name,
          // Add other string properties as needed
          sender_name: sender.name,
          current_date: new Date().toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
          })
        };

        // Render email template
        const renderedEmail = renderString(emailTemplateContent, personalizationData);
        const [subject, body] = renderedEmail.split('<!--BODY-->');

        // Log the initial attempt
        const logId = await logInitialAttempt(supabase, {
          original_lead_id: lead.id ? lead.id.toString() : '',
          contact_name: lead.contact_name,
          contact_email: contactEmail,
          property_address: lead.property_address,
          property_city: lead.property_city,
          property_state: lead.property_state,
          property_postal_code: lead.property_postal_code || lead.zip_code || lead.property_zipcode,
          property_type: lead.property_type,
          baths: lead.baths,
          beds: lead.beds,
          year_built: lead.year_built,
          square_footage: lead.square_footage,
          assessed_total: lead.assessed_total,
          market_region,
          mls_curr_status: lead.mls_curr_status,
          mls_curr_days_on_market: lead.mls_curr_days_on_market,
          sender_name: sender.name,
          sender_email_used: sender.email,
          email_subject_sent: subject.trim(),
          email_body_preview_sent: `${body.substring(0, 100)}...`,
          campaign_id,
          campaign_run_id
        });

        // Generate PDF if needed
        const pdfBuffer = await generateLoiPdf(personalizationData, lead.id ? lead.id.toString() : '', contactEmail);

        // Send email
        await sendEmail(
          sender.email,
          contactEmail,
          subject.trim(),
          body,
          pdfBuffer ? [
            {
              filename: `Letter_of_Intent_${lead.property_address ? lead.property_address.replace(/[^a-zA-Z0-9]/g, '_') : lead.id}.pdf`,
              content: pdfBuffer
            }
          ] : undefined
        );

        // Update email log status
        await updateEmailLogStatus(supabase, logId!, 'SENT', new Date().toISOString());

        // Update lead's email_sent status
        const { error: updateError } = await supabase
          .from(leadTableName)
          .update({ email_sent: true })
          .eq('id', lead.id);

        if (updateError) {
          console.error(`Error updating email_sent status for lead ID ${lead.id}:`, updateError);
        }

        // Increment sender sent count
        await incrementSenderSentCount(supabase, sender.id);

        successCount++;
      } catch (error: any) {
        failureCount++;
        processingErrors.push({
          lead_id: lead.id.toString(),
          error: error.message || 'Unknown error during processing'
        });
        console.error(`Error processing lead ID ${lead.id}:`, error);
      }
    }

    return NextResponse.json({
      success: true,
      message: `Campaign processing completed. Attempted: ${attemptedCount}, Success: ${successCount}, Failure: ${failureCount}`,
      data: {
        attemptedCount,
        successCount,
        failureCount,
        processingErrors
      }
    });

  } catch (error: any) {
    console.error('Unexpected error in start-campaign handler:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error.message || 'An unknown error occurred.',
        data: {
          attemptedCount,
          successCount,
          failureCount,
          processingErrors
        }
      },
      { status: 500 }
    );
  }
}
