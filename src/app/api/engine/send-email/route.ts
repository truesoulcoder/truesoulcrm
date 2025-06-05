// src/app/api/engine/send-email/route.ts
import path from 'path';
import { NextRequest, NextResponse } from 'next/server';
import { configure, Environment as NunjucksEnvironment } from 'nunjucks';
import { createClient } from '@supabase/supabase-js'; // For creating a client instance

// Utils and Services
import { isValidEmail as validateEmailFromUtils } from '@/app/api/engine/_utils/_utils';
import { logSystemEvent } from '@/services/logService';
import { supabaseAdmin } from '@/utils/supabase-admin'; // For admin tasks like logging, or direct DB updates if needed

// Workflow Steps
import { determineMarketDetails } from './_workflowSteps/determineMarketDetails-helper';
import { fetchActiveSender } from './_workflowSteps/fetchActiveSender-helper';
import { fetchAndValidateLead } from './_workflowSteps/fetchAndValidateLead-helper'; // May need adjustment or direct query
import { generatePdfAttachment } from './_workflowSteps/generatePdfAttachment-helper';
import { prepareEmailContentAndAssets } from './_workflowSteps/prepareEmailContentAndAssets-helper';
import { sendEmailAndLogOutcome } from './_workflowSteps/sendEmailAndLogOutcome-helper';
// Removed: import { validateRequestAndParseBody } from './_workflowSteps/validateRequestAndParseBody-helper';
// We'll have a new, simpler validation for jobId

// Types
import { FineCutLead } from '@/types/leads'; // Assuming this type is compatible with what campaign_jobs stores or what fetchAndValidateLead returns
import { CampaignJobs as CampaignJob } from '@/types/campaign'; // Using the type from campaign.ts

// Nunjucks environment setup
const templateDir = path.join(process.cwd(), 'src', 'app', 'api', 'engine', 'templates');
const nunjucksEnv: NunjucksEnvironment = configure(templateDir, { autoescape: true });

// Fallback test recipient details (less relevant now, but can keep for direct tests if any)
const TEST_RECIPIENT_EMAIL = process.env.TEST_RECIPIENT_EMAIL;
const TEST_RECIPIENT_NAME = process.env.TEST_RECIPIENT_NAME;

// Define the expected request body from crondonkey
interface CrondonkeyPayload {
  jobId: number;
  sendToLead?: boolean; // Should always be true from crondonkey
}

// Define a type for the campaign_jobs row (adjust fields as per your actual table)
// You should ideally place this in a shared types file (e.g., src/types/db.ts)
// For now, defining it here:
// export interface CampaignJob {
//   id: number;
//   campaign_id: string; // UUID
//   status: string;
//   lead_id: string; // Assuming this is the ID for the market-specific lead table
//   contact_email: string;
//   contact_name: string | null;
//   assigned_sender_id: string | null; // UUID
//   market_region_normalized_name?: string; // If you store this directly or can derive it
//   // ... any other relevant fields from campaign_jobs
// }


async function updateJobStatus(
  supabase: ReturnType<typeof createClient>, // Instance client
  jobId: number,
  status: 'sent' | 'failed' | 'processing_api', // Add more statuses if needed
  updateData: Partial<CampaignJob> & { processed_at: string }
) {
  const { error } = await supabase
    .from('campaign_jobs')
    .update({ status, ...updateData })
    .eq('id', jobId);

  if (error) {
    console.error(`Failed to update job ${jobId} status to ${status}:`, error);
    // Log this failure to system_event_logs as it's critical for tracking
    await logSystemEvent({
        event_type: 'JOB_STATUS_UPDATE_FAILURE',
        message: `Failed to update job ${jobId} to status ${status}. DB Error: ${error.message}`,
        details: { jobId, targetStatus: status, errorDetails: error },
        level: 'error',
    });
  } else {
    console.log(`Job ${jobId} status updated to ${status}.`);
  }
}


export async function POST(request: NextRequest) {
  let jobId: number | undefined;
  let supabaseClient; // To be initialized per request if using RLS, or use supabaseAdmin

  // Initialize Supabase client - use supabaseAdmin if RLS is not a concern for these operations
  // If RLS is needed based on user context (not typical for a backend worker call),
  // you'd create a client using request headers for auth.
  // For a worker, supabaseAdmin is usually appropriate.
  supabaseClient = supabaseAdmin; // Using admin client for direct DB operations

  try {
    const body: CrondonkeyPayload = await request.json();
    jobId = body.jobId;

    if (!jobId || typeof jobId !== 'number') {
      return NextResponse.json({ success: false, error: 'Invalid or missing jobId.' }, { status: 400 });
    }
    if (body.sendToLead !== true) {
        // This route is specifically for crondonkey sending to leads
        return NextResponse.json({ success: false, error: 'sendToLead must be true for this endpoint.' }, { status: 400 });
    }

    // Mark job as being processed by API (optional, but good for visibility)
    // await updateJobStatus(supabaseClient, jobId, 'processing_api', { processed_at: new Date().toISOString() });

    // STEP 1: Fetch Job Details from campaign_jobs table
    const { data: jobDetails, error: jobFetchError } = await supabaseClient
      .from('campaign_jobs')
      .select('*') // Select all necessary fields
      .eq('id', jobId)
      .single();

    if (jobFetchError || !jobDetails) {
      const errorMsg = `Failed to fetch job details for jobId ${jobId}: ${jobFetchError?.message || 'Not found.'}`;
      console.error(errorMsg);
      // No need to update status if job not found, but log it
      await logSystemEvent({
        event_type: 'JOB_FETCH_FAILURE',
        message: errorMsg,
        details: { jobId, error: jobFetchError },
        level: 'error',
      });
      return NextResponse.json({ success: false, error: errorMsg }, { status: jobFetchError?.code === 'PGRST116' ? 404 : 500 });
    }
    
    // Cast to your CampaignJob type
    const currentJob = jobDetails as CampaignJob;

    // Prevent re-processing if already sent or permanently failed (unless retry logic is intended)
    if (currentJob.status === 'sent' || currentJob.status === 'failed_permanent') {
        console.warn(`Job ${jobId} already in terminal status '${currentJob.status}'. Skipping.`);
        return NextResponse.json({ success: true, message: `Job ${jobId} already processed with status: ${currentJob.status}.` });
    }


    // Extract necessary IDs and data from currentJob
    const campaignId = currentJob.campaign_id;
    const leadIdInJob = currentJob.lead_id; // This is the ID for the market-specific lead table
    const contactEmail = currentJob.contact_email;
    const contactName = currentJob.contact_name;
    const assignedSenderId = currentJob.assigned_sender_id;
    // Assuming market_region_normalized_name is part of campaign_jobs or can be derived
    // If not, determineMarketDetails might need campaignId first.
    // For now, let's assume it's available or determineMarketDetails can work with campaignId.

    if (!campaignId || !leadIdInJob || !contactEmail || !assignedSenderId) {
        const missingDataError = `Job ${jobId} is missing critical data (campaign_id, lead_id, contact_email, or assigned_sender_id) in campaign_jobs table.`;
        console.error(missingDataError);
        await updateJobStatus(supabaseClient, jobId, 'failed', { 
            error_message: 'Job data incomplete in campaign_jobs table.', 
            processed_at: new Date().toISOString() 
        });
        return NextResponse.json({ success: false, error: missingDataError }, { status: 400 });
    }

    // STEP 2: Fetch Active Sender Details
    // fetchActiveSender might need market_region_normalized_name.
    // If market_region_normalized_name is NOT in campaign_jobs, you might need to fetch campaign details first
    // to get the market_region, then normalize it.
    // Let's assume for now `determineMarketDetails` can give us this from campaignId or jobDetails.
    
    // First, get market details to find the lead table name and normalized market region
    // This might need adjustment if market_region isn't directly on campaign_jobs
    // One option: Fetch campaign details using campaignId to get its market_region.
    const { data: campaignData, error: campaignFetchError } = await supabaseClient
        .from('campaigns')
        .select('market_region, id') // Add other campaign fields if needed by other steps
        .eq('id', campaignId)
        .single();

    if (campaignFetchError || !campaignData) {
        const errorMsg = `Failed to fetch campaign details for campaignId ${campaignId} (job ${jobId}): ${campaignFetchError?.message || 'Not found.'}`;
        console.error(errorMsg);
        await updateJobStatus(supabaseClient, jobId, 'failed', { error_message: errorMsg, processed_at: new Date().toISOString() });
        return NextResponse.json({ success: false, error: errorMsg }, { status: 500 });
    }
    const marketRegionFromCampaign = campaignData.market_region;


    // STEP 3: Determine Market-Specific Details
    const marketDetails = await determineMarketDetails(
      marketRegionFromCampaign, // Use market_region from the fetched campaign
      campaignId
    );

    // STEP 2 (Revisited with market_region_normalized_name): Fetch Active Sender
     const sender = await fetchActiveSender(
      supabaseClient,
      assignedSenderId, // Pass the assignedSenderId from the job
      campaignId,       // Pass campaignId for logging/context
      marketDetails.normalizedMarketRegionName
    );

    // STEP 4: Fetch and Validate Lead Data
    // fetchAndValidateLead expects specificLeadIdToTest. We use leadIdInJob from campaign_jobs.
    const lead = await fetchAndValidateLead(
      supabaseClient,
      marketDetails.leadTableName,
      marketDetails.normalizedMarketRegionName,
      leadIdInJob, // Use the lead_id from the job
      campaignId
    );
    // leadForErrorLogging = lead; // Already handled by jobDetails

    // STEP 5: Prepare Email Content and Assets
    const emailAssets = await prepareEmailContentAndAssets(
      lead, // This lead object should have contact_email, contact_name etc.
      sender,
      nunjucksEnv,
      templateDir,
      campaignId
    );

    // STEP 6: Generate PDF Attachment (assuming sendPdf is always true or configurable)
    // For now, let's assume sendPdf is true for these campaign emails
    const pdfBuffer = await generatePdfAttachment(
      true, // sendPdf flag - make this dynamic if needed based on campaign settings
      emailAssets.templateContext,
      lead,
      leadIdInJob,
      campaignId
    );
    
    // STEP 7: Send Email and Log Outcome (This helper also logs to engine_log)
    const emailDispatchOutcome = await sendEmailAndLogOutcome({
      supabase: supabaseClient,
      sender,
      lead, // The fetched lead object
      emailAssets,
      pdfBuffer,
      sendToLead: true, // From crondonkey payload, hardcoded true here
      testRecipientEmail: '', // Not used when sendToLead is true
      testRecipientName: '',  // Not used when sendToLead is true
      campaignId: campaignId,
      marketRegionNormalizedName: marketDetails.normalizedMarketRegionName,
      // Pass jobId to sendEmailAndLogOutcome if it needs to update campaign_jobs directly
      // OR update campaign_jobs status here based on emailDispatchOutcome
    });

    // STEP 8: Update campaign_jobs status based on dispatch outcome
    if (emailDispatchOutcome.success) {
      await updateJobStatus(supabaseClient, jobId, 'sent', {
        email_message_id: emailDispatchOutcome.messageId,
        processed_at: new Date().toISOString(),
        error_message: null, // Clear any previous error
      });
      return NextResponse.json({
        success: true,
        message: `Email for job ${jobId} sent successfully. Message ID: ${emailDispatchOutcome.messageId || 'N/A'}`,
        jobId: jobId,
        lead_id: lead.id, // from the fetched lead
      });
    } else {
      await updateJobStatus(supabaseClient, jobId, 'failed', {
        error_message: emailDispatchOutcome.error || 'Failed to send email (unknown reason from sendEmailAndLogOutcome).',
        processed_at: new Date().toISOString(),
      });
      return NextResponse.json(
        { success: false, error: `Failed to send email for job ${jobId}.`, jobId: jobId, details: emailDispatchOutcome.error },
        { status: 500 }
      );
    }

  } catch (error: unknown) {
    let errorMessage = 'An unknown error occurred in send-email route.';
    let errorStack = undefined;
    // let errorName = 'UnknownError'; // Not used in this simplified logging

    if (error instanceof Error) {
      errorMessage = error.message;
      errorStack = error.stack;
      // errorName = error.name;
    } else if (typeof error === 'string') {
      errorMessage = error;
    }
    console.error(`Critical error in POST /api/engine/send-email for job ${jobId}: ${errorMessage}`, errorStack);

    // Update job status to failed if jobId is known
    if (jobId && supabaseClient) {
      try {
        await updateJobStatus(supabaseClient, jobId, 'failed', {
          error_message: `Route handler critical error: ${errorMessage.substring(0, 500)}`, // Limit error message length
          processed_at: new Date().toISOString(),
        });
      } catch (statusUpdateError) {
        console.error(`Failed to update job status during critical error handling for job ${jobId}:`, statusUpdateError);
      }
    }
    
    // Log to system_event_logs for broader system errors
    await logSystemEvent({
        event_type: 'SEND_EMAIL_ROUTE_CRITICAL_ERROR',
        message: `Unhandled error in send-email POST handler for job ${jobId}: ${errorMessage}`,
        details: { jobId, error: { message: errorMessage, stack: errorStack } },
        level: 'critical',
    });

    return NextResponse.json(
      { success: false, error: `An unexpected error occurred: ${errorMessage}`, jobId: jobId },
      { status: 500 }
    );
  }
}