// src/app/api/engine/test-email/modular-route.ts
import path from 'path'; // Still used for templateDir

import { NextRequest, NextResponse } from 'next/server';
import { configure, Environment as NunjucksEnvironment } from 'nunjucks'; // Imported NunjucksEnvironment for typing

// IMPORTANT: Ensure these paths are correct according to your tsconfig.json 'paths' and actual file locations.

import { isValidEmail as validateEmailFromUtils } from '@/app/api/engine/_utils/_utils'; // Used in POST success response
import { logSystemEvent } from '@/services/logService'; // For error logging in POST
import { FineCutLead } from '@/types/supabase'; // Used for leadForResponse type in POST handler
import { supabaseAdmin } from '@/utils/supabase-admin'; // For error logging in POST

// Import workflow steps
import { determineMarketDetails } from './_workflowSteps/determineMarketDetails-helper';
import { fetchActiveSender } from './_workflowSteps/fetchActiveSender-helper';
import { fetchAndValidateLead } from './_workflowSteps/fetchAndValidateLead-helper';
import { generatePdfAttachment } from './_workflowSteps/generatePdfAttachment-helper';
import { prepareEmailContentAndAssets } from './_workflowSteps/prepareEmailContentAndAssets-helper';
import { sendEmailAndLogOutcome } from './_workflowSteps/sendEmailAndLogOutcome-helper';
import { validateRequestAndParseBody } from './_workflowSteps/validateRequestAndParseBody-helper';
// Types that might be needed by the POST handler for responses or variables
// import { EmailLogEntry } from './_workflowSteps/_types'; // If logToSupabase is used directly in POST's catch, else not needed here
// Note: Most specific types (SenderData, EmailAssets, etc.) are now primarily used within _workflowSteps.ts

// Nunjucks environment setup - REMAINS IN route.ts as it's specific to this route's setup
const templateDir = path.join(process.cwd(), 'src', 'app', 'api', 'engine', 'templates');
const nunjucksEnv: NunjucksEnvironment = configure(templateDir, { autoescape: true });

// Hardcoded recipient details - REMAINS IN route.ts for sendEmailAndLogOutcome if needed as fallbacks
const TEST_RECIPIENT_EMAIL = process.env.TEST_RECIPIENT_EMAIL;
const TEST_RECIPIENT_NAME = process.env.TEST_RECIPIENT_NAME;

// Type for logging - This is also defined in _workflowSteps.ts.
// To avoid duplication, it should ideally be in a shared types file.
// For now, if POST's catch block uses it, it might need to be here or imported from _workflowSteps.
// EmailLogEntry interface definition removed as it's in _workflowSteps.ts

export async function POST(request: NextRequest) {
  let validatedParams: Awaited<ReturnType<typeof validateRequestAndParseBody>> | undefined;
  let leadForErrorLogging: FineCutLead | null = null; // FineCutLead is imported from '@/types/supabase'

  try {
    // STEP 1: Validate Request Parameters & Initialize Supabase Client (from _workflowSteps/validateRequestAndParseBody-helper.ts)
    validatedParams = await validateRequestAndParseBody(request);

    // STEP 2: Fetch Active Sender Details (from _workflowSteps/fetchActiveSender-helper.ts)
    const sender = await fetchActiveSender(
      validatedParams.supabase,
      validatedParams.campaignId,
      validatedParams.marketRegionNormalizedName
    );

    // STEP 3: Determine Market-Specific Details (from _workflowSteps/determineMarketDetails-helper.ts)
    const marketDetails = await determineMarketDetails(
      validatedParams.marketRegionNormalizedName,
      validatedParams.campaignId
    );

    // STEP 4: Fetch and Validate Lead Data (from _workflowSteps/fetchAndValidateLead-helper.ts)
    const lead = await fetchAndValidateLead(
      validatedParams.supabase,
      marketDetails.leadTableName,
      marketDetails.normalizedMarketRegionName,
      validatedParams.specificLeadIdToTest,
      validatedParams.campaignId
    );
    leadForErrorLogging = lead;

    // STEP 5: Prepare Email Content (Subject/Body) and Assets (from _workflowSteps/prepareEmailContentAndAssets-helper.ts)
    const emailAssets = await prepareEmailContentAndAssets(
      lead,
      sender,
      nunjucksEnv,      // From modular-route.ts scope
      templateDir,      // From modular-route.ts scope
      validatedParams.campaignId
    );

    // STEP 6: Generate PDF Attachment if requested (from _workflowSteps/generatePdfAttachment-helper.ts)
    const pdfBuffer = await generatePdfAttachment(
      validatedParams.sendPdf,
      emailAssets.templateContext,
      lead,
      validatedParams.specificLeadIdToTest,
      validatedParams.campaignId
    );

    // STEP 7: Validate marketDetails.normalizedMarketRegionName (crucial check in route.ts)
    if (typeof marketDetails.normalizedMarketRegionName !== 'string' || marketDetails.normalizedMarketRegionName.trim() === '') {
      console.error('Critical: marketDetails.normalizedMarketRegionName is undefined, not a string, or empty.');
      // Log marketDetails for better debugging context
      console.error('marketDetails content:', JSON.stringify(marketDetails, null, 2));
      return NextResponse.json(
        { success: false, message: 'Internal server error: Market region details are incomplete or invalid.' },
        { status: 500 }
      );
    }

    // STEP 8: Send Email and Log Outcome (from _workflowSteps/sendEmailAndLogOutcome-helper.ts)
    const emailDispatchOutcome = await sendEmailAndLogOutcome({
      supabase: validatedParams.supabase,
      sender,
      lead,
      emailAssets,
      pdfBuffer,
      sendToLead: validatedParams.sendToLead,
      testRecipientEmail: TEST_RECIPIENT_EMAIL || '', // Default to empty string if undefined From route.ts scope
      testRecipientName: TEST_RECIPIENT_NAME || '',   // Default to empty string if undefined From route.ts scope
      campaignId: validatedParams.campaignId,
      marketRegionNormalizedName: marketDetails.normalizedMarketRegionName,
    });

    // STEP 9: Return Final Response based on email dispatch outcome
    if (emailDispatchOutcome.success) {
      const recipientEmailForResponse = validatedParams.sendToLead && lead.contact_email && validateEmailFromUtils(lead.contact_email)
        ? lead.contact_email
        : TEST_RECIPIENT_EMAIL;

      return NextResponse.json({
        success: true,
        message: `Test email sent successfully. Message ID: ${emailDispatchOutcome.messageId || 'N/A'}`,
        lead_id: lead.id,
        original_lead_id: String(lead.id),
        recipient_email: recipientEmailForResponse,
        subject: emailAssets.subject,
      });
    } else {
      return NextResponse.json(
        {
          success: false,
          error: 'Failed to send email.',
          lead_id: lead.id,
          original_lead_id: String(lead.id),
          details: emailDispatchOutcome.error,
        },
        { status: 500 }
      );
    }
  } catch (error: unknown) {
    // STEP 10: Global Error Handling for the entire request lifecycle
    let errorMessage = 'An unknown error occurred.';
    let errorStack = undefined;
    let errorName = 'UnknownError';

    if (error instanceof Error) {
      errorMessage = error.message;
      errorStack = error.stack;
      errorName = error.name;
    } else if (typeof error === 'string') {
      errorMessage = error;
    }

    console.error(`Critical error in POST /api/engine/test-email/modular-route.ts: ${errorMessage}`, errorStack);

    const leadIdForError = validatedParams?.specificLeadIdToTest || String(leadForErrorLogging?.id) || 'N/A';
    const marketRegionForError = validatedParams?.marketRegionNormalizedName || leadForErrorLogging?.market_region || 'unknown';
    const campaignIdForError = validatedParams?.campaignId;

    try {
      await supabaseAdmin.from('engine_log').insert([{
        market_region_normalized_name: marketRegionForError,
        email_status: 'ERROR_ROUTE_HANDLER',
        email_error_message: `Route handler error: ${errorMessage}`,
        campaign_id: campaignIdForError,
        details: JSON.stringify({ stack: errorStack, name: errorName, message: errorMessage }),
        email_sent_at: new Date().toISOString(),
      }]);
    } catch (loggingError: unknown) {
      let logErrorMessage = 'Failed to log to Supabase due to an unknown error.';
      if (loggingError instanceof Error) {
        logErrorMessage = loggingError.message;
      }
      console.error('CRITICAL: Failed to log unhandled POST error to Supabase:', logErrorMessage);
      await logSystemEvent({
        event_type: 'ENGINE_ROUTE_HANDLER_CRITICAL_LOG_FAILURE',
        message: `Failed to log to Supabase (Reason: ${String(logErrorMessage)}), then unhandled error in POST handler: ${String(errorMessage)}`,
        details: { 
          mainError: { message: String(errorMessage), stack: String(errorStack), name: String(errorName) }, 
          loggingError: { message: String(logErrorMessage), stack: String(loggingError instanceof Error ? loggingError.stack : 'N/A') }, 
          lead_id: String(leadIdForError), 
          market_region: String(marketRegionForError), 
          campaign_id: String(campaignIdForError) 
        },
      });
    }

    let statusCode = 500;
    const errorMessageLower = errorMessage.toLowerCase();
    if (errorMessageLower.includes('invalid json') || errorMessageLower.includes('validation failed')) {
      statusCode = 400;
    } else if (errorMessageLower.includes('not found') || errorMessageLower.includes('no active sender found') || errorMessageLower.includes('no suitable lead found') || (errorMessageLower.includes('lead id') && errorMessageLower.includes('not found'))) {
      statusCode = 404;
    }

    return NextResponse.json(
      {
        success: false,
        error: `An unexpected error occurred: ${errorMessage}`,
        lead_id: leadIdForError,
      },
      { status: statusCode }
    );
  }
}


