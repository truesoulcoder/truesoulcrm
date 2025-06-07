// src/app/api/engine/send-email/route.ts
import path from 'path';
import { NextRequest, NextResponse } from 'next/server';
import { configure, Environment as NunjucksEnvironment } from 'nunjucks';
import { SupabaseClient } from '@supabase/supabase-js';

import { createAdminServerClient } from '@/lib/supabase/server'; // Ensure this path is correct
import { Database } from '@/db_types'; // Assuming this has campaign_jobs and job_logs
import { sendEmail, GmailError } from '@/services/gmailService'; // Assuming correct path
// Types from your new schema (or local definitions if not yet in db_types.ts)
type CampaignJob = Database['public']['Tables']['campaign_jobs']['Row'];
// Assuming CampaignJobStatus is an enum or string union type defined elsewhere or inline
enum CampaignJobStatus {
  Scheduled = 'scheduled', // Or however your enum/types are defined
  Processing = 'processing',
  Sent = 'completed', // 'completed' might be the new 'Sent'
  Failed = 'failed',
  FailedPermanent = 'failed_permanent' // Example, adjust as needed
}

// Import other necessary helpers - paths might need adjustment
// These helpers will be refactored to use jobDetails directly
import { fetchActiveSender } from './_workflowSteps/fetchActiveSender-helper'; 
import { generatePdfAttachment } from './_workflowSteps/generatePdfAttachment-helper'; 
import { prepareEmailContentAndAssets } from './_workflowSteps/prepareEmailContentAndAssets-helper'; 

const templateDir = path.join(process.cwd(), 'src', 'app', 'api', 'engine', 'templates');
const nunjucksEnv: NunjucksEnvironment = configure(templateDir, { autoescape: true });


// Simplified validated lead data structure (derived from CampaignJob)
interface ValidatedLeadData {
  id: string; // original lead_id from campaign_jobs.lead_id (if it's a UUID) or property_id
  contact_email: string;
  contact_name: string | null;
  property_address: string | null;
  property_city: string | null;
  property_state: string | null;
  property_postal_code: string | null;
  property_type: string | null;
  square_footage: string | null; // Assuming text, adjust if numeric
  lot_size_sqft: string | null;  // Assuming text
  beds: string | null;           // Assuming text
  baths: string | null;          // Assuming text
  year_built: string | null;       // Assuming text
  assessed_total: number | null; // Numeric from campaign_jobs
  mls_curr_status: string | null;
  mls_curr_days_on_market: string | null;
  // Include any other fields needed by personalization & PDF generation from CampaignJob
  [key: string]: any; // Allow other fields from CampaignJob
}


async function updateJobStatus(
  supabase: SupabaseClient<Database>,
  jobId: number, // campaign_jobs.id is bigint, so number is fine
  status: CampaignJobStatus,
  updateFields: Partial<CampaignJob> // Use Partial of CampaignJob for flexibility
) {
  const { error } = await supabase
    .from('campaign_jobs')
    .update({ status: status as string, ...updateFields }) // Cast status if using enum
    .eq('id', jobId);

  if (error) {
    console.error(`Failed to update job ${jobId} status to ${status}:`, error);
    // Consider logging to a system log if logService is available and configured
    // await logSystemEvent({ ... }); 
  } else {
    console.log(`Job ${jobId} status updated to ${status}.`);
  }
}

async function updateJobLog(
  supabase: SupabaseClient<Database>,
  job_id: number, // This is campaign_jobs.id
  log_message: string,
  details: Record<string, any>
) {
  const { error } = await supabase
    .from('job_logs') // New table
    .update({ 
        log_message, 
        details,
        // updated_at is likely handled by the DB
    })
    .eq('job_id', job_id); // Match with the job_id from campaign_jobs

  if (error) {
    console.error(`Failed to update job_logs for job_id ${job_id}:`, error);
    // This error is critical for tracing, might need more robust handling
  } else {
    console.log(`job_logs updated for job_id ${job_id}.`);
  }
}


// Refactored fetchAndValidateLead (no longer fetches, just validates/transforms jobDetails)
async function validateAndStructureLeadData(job: CampaignJob): Promise<ValidatedLeadData> {
  if (!job.contact_email) {
    throw new Error('Missing contact_email in job details.');
  }
  // Add other critical field validations as needed
  // For example, check for fields required by PDF generation or email templating.
  if (!job.property_address) { // Example validation
      console.warn(`Job ID ${job.id}: Missing property_address. PDF generation might be affected.`);
  }


  // Transform/map fields from CampaignJob to ValidatedLeadData if necessary
  // For this refactor, we assume direct mapping for most fields.
  // The 'id' for ValidatedLeadData could be job.lead_id or derived if needed.
  // For simplicity, if jobDetails contains all necessary fields with correct names, return it.
  return {
    id: job.lead_id || job.id.toString(), // Use job.lead_id or job.id as a fallback identifier
    contact_email: job.contact_email,
    contact_name: job.contact_name,
    property_address: job.property_address,
    property_city: job.property_city,
    property_state: job.property_state,
    property_postal_code: job.property_postal_code,
    property_type: job.property_type,
    square_footage: job.square_footage,
    lot_size_sqft: job.lot_size_sqft,
    beds: job.beds,
    baths: job.baths,
    year_built: job.year_built,
    assessed_total: job.assessed_total, // This field is directly in campaign_jobs now
    mls_curr_status: job.mls_curr_status,
    mls_curr_days_on_market: job.mls_curr_days_on_market,
    // Add any other necessary fields from job to satisfy downstream functions
    ...job // Spread other job details if they are useful and don't conflict
  };
}


export async function POST(request: NextRequest) {
  let currentJobDetails: CampaignJob | null = null;
  const supabaseClient = createAdminServerClient<Database>();

  try {
    currentJobDetails = await request.json() as CampaignJob;

    if (!currentJobDetails || !currentJobDetails.id || typeof currentJobDetails.id !== 'number') {
      return NextResponse.json({ success: false, error: 'Invalid or missing jobDetails payload or job ID.' }, { status: 400 });
    }
    
    const jobId = currentJobDetails.id; // campaign_jobs.id

    // Check terminal status (example: if 'completed' is the new 'Sent')
    if (currentJobDetails.status === CampaignJobStatus.Sent || currentJobDetails.status === CampaignJobStatus.FailedPermanent) {
      console.warn(`Job ${jobId} already in terminal status '${currentJobDetails.status}'. Skipping.`);
      return NextResponse.json({ success: true, message: `Job ${jobId} already processed with status: ${currentJobDetails.status}.` });
    }

    const { campaign_id, contact_email, assigned_sender_id } = currentJobDetails;

    if (!campaign_id || !contact_email || !assigned_sender_id) {
      const missingDataError = `Job ${jobId} is missing critical data (campaign_id, contact_email, or assigned_sender_id).`;
      console.error(missingDataError);
      await updateJobStatus(supabaseClient, jobId, CampaignJobStatus.Failed, {
        error_message: 'Job data incomplete.',
        processed_at: new Date().toISOString(),
      });
      await updateJobLog(supabaseClient, jobId, 'Job processing failed', { error: missingDataError });
      return NextResponse.json({ success: false, error: missingDataError }, { status: 400 });
    }
    
    // No longer need to fetch campaignData for market_region if all info is in jobDetails
    // const marketDetails = await determineMarketDetails(...); // Removed

    const sender = await fetchActiveSender(supabaseClient, assigned_sender_id, campaign_id.toString()); // Pass campaign_id as string if needed

    // Validated lead data comes directly from currentJobDetails (the CampaignJob row)
    const validatedLeadData = await validateAndStructureLeadData(currentJobDetails);

    const emailAssets = await prepareEmailContentAndAssets(validatedLeadData, sender, nunjucksEnv, templateDir, campaign_id.toString());
    
    // Assuming generatePdfAttachment can also use validatedLeadData
    const pdfBuffer = await generatePdfAttachment(true, emailAssets.templateContext, validatedLeadData, validatedLeadData.id, campaign_id.toString());

    let emailSentSuccessfully = false;
    let emailMessageId: string | undefined;
    let emailError: string | undefined;

    try {
      console.log(`Attempting to send email for job ${jobId} to ${validatedLeadData.contact_email} via ${sender.email}`);
      const sendResult = await sendEmail({
        to: validatedLeadData.contact_email,
        subject: emailAssets.subject,
        htmlContent: emailAssets.htmlBody,
        attachments: [{
          content: pdfBuffer.toString('base64'),
          filename: emailAssets.attachmentFilename,
          type: 'application/pdf',
          disposition: 'attachment',
        }],
      }, sender.credentials_json); // Assuming sender object contains credentials_json

      emailMessageId = sendResult.messageId;
      emailSentSuccessfully = true;
      console.log(`Email for job ${jobId} sent successfully. Message ID: ${emailMessageId}`);
      
      await updateJobLog(supabaseClient, jobId, 'Email sent successfully.', { messageId: emailMessageId });
      await updateJobStatus(supabaseClient, jobId, CampaignJobStatus.Sent, { // 'completed' as new 'Sent'
        email_message_id: emailMessageId, 
        processed_at: new Date().toISOString(),
        error_message: null,
      });

    } catch (sendError: any) {
      emailSentSuccessfully = false;
      emailError = sendError instanceof GmailError ? sendError.message : (sendError.message || 'Unknown send error');
      console.error(`Failed to send email for job ${jobId}:`, emailError);
      
      await updateJobLog(supabaseClient, jobId, 'Email send failed.', { error: emailError, details: sendError.stack });
      // Decide if this is a permanent failure based on error type if possible
      const targetErrorStatus = (sendError instanceof GmailError && sendError.isPermanentFailure)
                                ? CampaignJobStatus.FailedPermanent
                                : CampaignJobStatus.Failed;
      await updateJobStatus(supabaseClient, jobId, targetErrorStatus, {
        error_message: emailError,
        processed_at: new Date().toISOString(),
      });
    }

    if (emailSentSuccessfully) {
      return NextResponse.json({
        success: true,
        message: `Email for job ${jobId} sent successfully. Message ID: ${emailMessageId || 'N/A'}`,
        jobId: jobId,
        lead_id: validatedLeadData.id, // Or currentJobDetails.lead_id
      });
    } else {
      return NextResponse.json(
        { success: false, error: `Failed to send email for job ${jobId}.`, jobId: jobId, details: emailError },
        { status: 500 } // Internal Server Error for send failure
      );
    }

  } catch (error: unknown) {
    let errorMessage = 'An unknown error occurred in send-email route.';
    let errorStack = undefined;
    const jobIdForLog = currentJobDetails?.id;

    if (error instanceof Error) {
      errorMessage = error.message;
      errorStack = error.stack;
    } else if (typeof error === 'string') {
      errorMessage = error;
    }
    console.error(`Critical error in POST /api/engine/send-email for job ${jobIdForLog}: ${errorMessage}`, errorStack);

    if (jobIdForLog && supabaseClient) {
      try {
        await updateJobStatus(supabaseClient, jobIdForLog, CampaignJobStatus.FailedPermanent, {
          error_message: `Route handler critical error: ${errorMessage.substring(0, 500)}`,
          processed_at: new Date().toISOString(),
        });
        await updateJobLog(supabaseClient, jobIdForLog, 'Critical route error.', { error: errorMessage, stack: errorStack });
      } catch (statusUpdateError) {
        console.error(`Failed to update job status/log during critical error handling for job ${jobIdForLog}:`, statusUpdateError);
      }
    }
    // Log to system_event_logs if available
    // await logSystemEvent({ ... });

    return NextResponse.json(
      { success: false, error: `An unexpected error occurred: ${errorMessage}`, jobId: jobIdForLog },
      { status: 500 }
    );
  }
}