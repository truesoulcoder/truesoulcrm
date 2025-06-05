// src/app/api/engine/send-email/route.ts
import path from 'path';
import { NextRequest, NextResponse } from 'next/server';
import { configure, Environment as NunjucksEnvironment } from 'nunjucks';
import { SupabaseClient } from '@supabase/supabase-js';
import { logSystemEvent } from '@/services/logService';
import { supabaseAdmin } from '@/utils/supabase-admin';
import { determineMarketDetails } from './_workflowSteps/determineMarketDetails-helper';
import { fetchActiveSender } from './_workflowSteps/fetchActiveSender-helper';
import { fetchAndValidateLead } from './_workflowSteps/fetchAndValidateLead-helper';
import { generatePdfAttachment } from './_workflowSteps/generatePdfAttachment-helper';
import { prepareEmailContentAndAssets } from './_workflowSteps/prepareEmailContentAndAssets-helper';
import { sendEmailAndLogOutcome } from './_workflowSteps/sendEmailAndLogOutcome-helper';
import { CampaignJobs as CampaignJob, CampaignJobStatus } from '@/types/campaign';

const templateDir = path.join(process.cwd(), 'src', 'app', 'api', 'engine', 'templates');
const nunjucksEnv: NunjucksEnvironment = configure(templateDir, { autoescape: true });

interface CrondonkeyPayload {
  jobId: number;
  sendToLead?: boolean;
}

async function updateJobStatus(
  supabase: SupabaseClient,
  jobId: number,
  status: CampaignJobStatus,
  updateData: Partial<CampaignJob> & { processed_at: string }
) {
  const { error } = await supabase
    .from('campaign_jobs')
    .update({ status, ...updateData })
    .eq('id', jobId);

  if (error) {
    console.error(`Failed to update job ${jobId} status to ${status}:`, error);
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
  const supabaseClient: SupabaseClient = supabaseAdmin;

  try {
    const body: CrondonkeyPayload = await request.json();
    jobId = body.jobId;

    if (!jobId || typeof jobId !== 'number') {
      return NextResponse.json({ success: false, error: 'Invalid or missing jobId.' }, { status: 400 });
    }
    if (body.sendToLead !== true) {
      return NextResponse.json({ success: false, error: 'sendToLead must be true for this endpoint.' }, { status: 400 });
    }

    const { data: jobDetails, error: jobFetchError } = await supabaseClient
      .from('campaign_jobs')
      .select('*')
      .eq('id', jobId)
      .single();

    if (jobFetchError || !jobDetails) {
      const errorMsg = `Failed to fetch job details for jobId ${jobId}: ${jobFetchError?.message || 'Not found.'}`;
      console.error(errorMsg);
      await logSystemEvent({
        event_type: 'JOB_FETCH_FAILURE',
        message: errorMsg,
        details: { jobId, error: jobFetchError },
        level: 'error',
      });
      return NextResponse.json({ success: false, error: errorMsg }, { status: jobFetchError?.code === 'PGRST116' ? 404 : 500 });
    }

    const currentJob = jobDetails as CampaignJob;

    if (currentJob.status === CampaignJobStatus.Sent || currentJob.status === CampaignJobStatus.FailedPermanent) {
      console.warn(`Job ${jobId} already in terminal status '${currentJob.status}'. Skipping.`);
      return NextResponse.json({ success: true, message: `Job ${jobId} already processed with status: ${currentJob.status}.` });
    }

    const campaignId = currentJob.campaign_id;
    const leadIdInJob = currentJob.lead_id;
    const contactEmail = currentJob.contact_email;
    const assignedSenderId = currentJob.assigned_sender_id;

    if (!campaignId || !leadIdInJob || !contactEmail || !assignedSenderId) {
      const missingDataError = `Job ${jobId} is missing critical data (campaign_id, lead_id, contact_email, or assigned_sender_id) in campaign_jobs table.`;
      console.error(missingDataError);
      await updateJobStatus(supabaseClient, jobId, CampaignJobStatus.Failed, {
        error_message: 'Job data incomplete in campaign_jobs table.',
        processed_at: new Date().toISOString(),
      });
      return NextResponse.json({ success: false, error: missingDataError }, { status: 400 });
    }

    const { data: campaignData, error: campaignFetchError } = await supabaseClient
      .from('campaigns')
      .select('market_region, id')
      .eq('id', campaignId)
      .single();

    if (campaignFetchError || !campaignData) {
      const errorMsg = `Failed to fetch campaign details for campaignId ${campaignId} (job ${jobId}): ${campaignFetchError?.message || 'Not found.'}`;
      console.error(errorMsg);
      await updateJobStatus(supabaseClient, jobId, CampaignJobStatus.Failed, { error_message: errorMsg, processed_at: new Date().toISOString() });
      return NextResponse.json({ success: false, error: errorMsg }, { status: 500 });
    }
    const marketRegionFromCampaign = campaignData.market_region;

    const marketDetails = await determineMarketDetails(marketRegionFromCampaign, campaignId);

    const sender = await fetchActiveSender(supabaseClient, assignedSenderId, campaignId, marketDetails.normalizedMarketRegionName);

    const lead = await fetchAndValidateLead(supabaseClient, marketDetails.leadTableName, marketDetails.normalizedMarketRegionName, leadIdInJob, campaignId);

    const emailAssets = await prepareEmailContentAndAssets(lead, sender, nunjucksEnv, templateDir, campaignId);

    const pdfBuffer = await generatePdfAttachment(true, emailAssets.templateContext, lead, leadIdInJob, campaignId);

    const emailDispatchOutcome = await sendEmailAndLogOutcome({
      supabase: supabaseClient,
      sender,
      lead,
      emailAssets,
      pdfBuffer,
      sendToLead: true,
      testRecipientEmail: '',
      testRecipientName: '',
      campaignId: campaignId,
      marketRegionNormalizedName: marketDetails.normalizedMarketRegionName,
    });

    if (emailDispatchOutcome.success) {
      await updateJobStatus(supabaseClient, jobId, CampaignJobStatus.Sent, {
        email_message_id: emailDispatchOutcome.messageId,
        processed_at: new Date().toISOString(),
        error_message: null,
      });
      return NextResponse.json({
        success: true,
        message: `Email for job ${jobId} sent successfully. Message ID: ${emailDispatchOutcome.messageId || 'N/A'}`,
        jobId: jobId,
        lead_id: lead.id,
      });
    } else {
      await updateJobStatus(supabaseClient, jobId, CampaignJobStatus.Failed, {
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

    if (error instanceof Error) {
      errorMessage = error.message;
      errorStack = error.stack;
    } else if (typeof error === 'string') {
      errorMessage = error;
    }
    console.error(`Critical error in POST /api/engine/send-email for job ${jobId}: ${errorMessage}`, errorStack);

    if (jobId && supabaseClient) {
      try {
        await updateJobStatus(supabaseClient, jobId, CampaignJobStatus.Failed, {
          error_message: `Route handler critical error: ${errorMessage.substring(0, 500)}`,
          processed_at: new Date().toISOString(),
        });
      } catch (statusUpdateError) {
        console.error(`Failed to update job status during critical error handling for job ${jobId}:`, statusUpdateError);
      }
    }

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