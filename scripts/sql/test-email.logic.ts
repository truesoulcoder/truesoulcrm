// src/app/api/engine/_utils/test-email.logic.ts
import fs from 'fs/promises';
import path from 'path';
import { configure, Environment as NunjucksEnvironment } from 'nunjucks';

import { createAdminServerClient } from '@/utils/supabase-admin';
import { Database, FineCutLead } from '@/types/supabase';
import { isValidEmail as validateEmailFromUtils } from '@/app/api/engine/_utils/_utils';
import { generateLoiPdf, PersonalizationData, sendEmail as sendGmailService } from '@/services';
import { logSystemEvent } from '@/services/logService';
import { OfferDetails, generateOfferDetails } from '@/actions/offerCalculations';
import { NextRequest } from 'next/server'; // For validateRequestAndParseBody

// --- START Type Definitions ---
export interface RequestPayload {
  marketRegionNormalizedName: string;
  leadId?: string;
  sendPdf?: boolean;
  sendToLead?: boolean;
  campaignId?: string;
}

export interface SenderData {
  sender_name: string;
  sender_email: string;
  email?: string; // Populated from sender_email if DB field is null/missing
  name?: string;  // Populated from sender_name if DB field is null/missing
  is_default: boolean;
}

export interface MarketDetails {
  market_region_normalized_name: string;
  leadTableName: string;
}

export interface ValidatedParams {
  marketRegionNormalizedName: string;
  sendPdf: boolean;
  sendToLead: boolean;
  specificLeadIdToTest?: string;
  campaignId?: string;
  supabase: ReturnType<typeof createAdminServerClient>;
}

export interface EmailAssets {
  subject: string;
  htmlBody: string;
  textBody: string;
  templateContext: Record<string, any>; // Includes OfferDetails
  logoBuffer?: Buffer;
  logoContentType?: string;
}

export interface EmailDispatchFullParams {
  supabase: ReturnType<typeof createAdminServerClient>;
  sender: SenderData;
  lead: FineCutLead;
  emailAssets: EmailAssets;
  pdfBuffer: Buffer | null;
  recipientEmail: string;
  campaignId?: string;
  marketRegionNormalizedName: string;
}

export interface EmailLogEntry {
  id?: number;
  created_at?: string;
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
  email_status: string; // 'SENT', 'ERROR', 'ATTEMPT'
  email_error_message?: string | null;
  email_sent_at?: string | null;
  campaign_id?: string | null;
  campaign_run_id?: string | null;
  converted?: boolean | null;
  [key: string]: any; // For flexibility if other details are logged
}
// --- END Type Definitions ---

// --- START Nunjucks Setup ---
const templateDir = path.join(process.cwd(), 'src', 'app', 'api', 'engine', 'templates');
export const nunjucksEnvInstance: NunjucksEnvironment = configure(templateDir, { autoescape: true });
// --- END Nunjucks Setup ---

// --- START Constants ---
export const MAX_LEAD_FETCH_ATTEMPTS = 20;
export const TEST_SENDER_EMAIL = process.env.TEST_SENDER_EMAIL || 'chrisphillips@truesoulpartners.com';
export const TEST_SENDER_NAME = process.env.TEST_SENDER_NAME || 'Chris Phillips';
export const TEST_RECIPIENT_EMAIL = process.env.TEST_RECIPIENT_EMAIL || 'chrisphillips@truesoulpartners.com';
export const TEST_RECIPIENT_NAME = process.env.TEST_RECIPIENT_NAME || 'Test Recipient';
// --- END Constants ---

// --- START Helper Functions (Internal - Not Exported) ---
function _validateLeadFields(lead: FineCutLead | null | undefined, leadIdForMsg: string | number): { isValid: boolean; errorMessages: string[]; validatedLead: FineCutLead | null } {
  if (!lead) {
    return { isValid: false, errorMessages: ['Lead data is null or undefined.'], validatedLead: null };
  }
  const errors: string[] = [];
  const {
    contact_name,
    contact_email,
    property_address,
    property_city,
    property_state,
    property_postal_code,
    assessed_total,
  } = lead;

  if (!contact_name || typeof contact_name !== 'string' || contact_name.trim() === '') {
    errors.push('contact_name is missing or invalid.');
  }
  if (!contact_email || !validateEmailFromUtils(contact_email)) {
    errors.push('contact_email is missing or invalid.');
  }
  if (!property_address || typeof property_address !== 'string' || property_address.trim() === '') {
    errors.push('property_address is missing or invalid.');
  }
  if (!property_city || typeof property_city !== 'string' || property_city.trim() === '') {
    errors.push('property_city is missing or invalid.');
  }
  if (!property_state || typeof property_state !== 'string' || property_state.trim() === '') {
    errors.push('property_state is missing or invalid.');
  }
  if (!property_postal_code || typeof property_postal_code !== 'string' || property_postal_code.trim() === '') {
    errors.push('property_postal_code is missing or invalid.');
  }
  if (assessed_total === null || typeof assessed_total === 'undefined' || typeof assessed_total !== 'number' || assessed_total <= 0) {
    errors.push('assessed_total is missing, invalid, or not a positive number.');
  }

  if (errors.length > 0) {
    console.warn(`Validation failed for lead ID ${leadIdForMsg}: ${errors.join('; ')}`);
    return { isValid: false, errorMessages: errors, validatedLead: lead };
  }
  return { isValid: true, errorMessages: [], validatedLead: lead as FineCutLead };
}

const extractSubjectAndCleanHtml = (
  renderedHtmlWithComment: string,
  context: Record<string, any>,
  nunjucks: NunjucksEnvironment
): { subject: string; cleanHtmlBody: string } => {
  const subjectRegex = /<!-- SUBJECT: (.*?) -->/s;
  const match = renderedHtmlWithComment.match(subjectRegex);
  let subject = `Offer for ${context.property_address || 'Your Property'}`;
  let cleanHtmlBody = renderedHtmlWithComment;

  if (match && match[1]) {
    try {
      subject = nunjucks.renderString(match[1].trim(), context);
    } catch (e: any) {
      console.error(`Error rendering subject template: "${match[1].trim()}"`, e);
      subject = match[1].trim() || subject;
    }
    cleanHtmlBody = renderedHtmlWithComment.replace(subjectRegex, '').trim();
  }
  return { subject, cleanHtmlBody };
};
// --- END Helper Functions (Internal - Not Exported) ---

// --- START Exported Logic Functions ---
export async function validateRequestAndParseBody(request: NextRequest): Promise<ValidatedParams> {
  let requestBody;
  try {
    requestBody = await request.json();
  } catch (error) {
    throw new Error('Invalid JSON in request body');
  }

  const {
    marketRegionNormalizedName,
    leadId: specificLeadIdToTest,
    sendPdf = true,
    sendToLead = false,
    campaignId,
  } = requestBody as RequestPayload;

  const validationErrors: string[] = [];
  if (!marketRegionNormalizedName || typeof marketRegionNormalizedName !== 'string' || marketRegionNormalizedName.trim() === '') {
    validationErrors.push('marketRegionNormalizedName is required and must be a non-empty string.');
  }
  if (typeof sendPdf !== 'boolean') {
    validationErrors.push('sendPdf must be a boolean.');
  }
  if (typeof sendToLead !== 'boolean') {
    validationErrors.push('sendToLead must be a boolean.');
  }
  if (specificLeadIdToTest !== undefined && (typeof specificLeadIdToTest !== 'string' || specificLeadIdToTest.trim() === '')) {
    validationErrors.push('specificLeadIdToTest must be a non-empty string if provided.');
  }
  if (campaignId !== undefined && (typeof campaignId !== 'string' || campaignId.trim() === '')) {
    validationErrors.push('campaignId must be a non-empty string if provided.');
  }

  if (validationErrors.length > 0) {
    throw new Error(`Validation failed: ${validationErrors.join('; ')}`);
  }

  const supabase = await createAdminServerClient();

  return {
    marketRegionNormalizedName: marketRegionNormalizedName.trim(),
    sendPdf,
    sendToLead,
    specificLeadIdToTest: specificLeadIdToTest?.trim(),
    campaignId: campaignId?.trim(),
    supabase,
  };
}

export async function fetchActiveSender(
  supabase: ReturnType<typeof createAdminServerClient>,
  campaignId?: string,
  marketRegionNormalizedName?: string
): Promise<SenderData> {
  const { data: senderResult, error: senderError } = await supabase
    .from('senders')
    .select('sender_email, sender_name, is_default, email, name, created_at')
    .eq('is_active', true)
    .eq('status', 'active')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle<Partial<SenderData> & { sender_email?: string | null; sender_name?: string | null; is_default?: boolean | null; created_at?: string | null }>();

  if (senderError) {
    console.error('Supabase error fetching sender:', senderError.message);
    await logSystemEvent({
      event_type: 'ENGINE_TEST_EMAIL_ERROR',
      message: `Error fetching active sender: ${senderError.message}`,
      details: { error: senderError, marketRegion: marketRegionNormalizedName },
      campaign_id: campaignId,
    });
    throw new Error(`Database error fetching active sender: ${senderError.message}`);
  }

  if (!senderResult || !senderResult.sender_email || !senderResult.sender_name) {
    await logSystemEvent({
      event_type: 'ENGINE_TEST_EMAIL_INFO',
      message: 'No active sender found or essential fields missing for test email.',
      details: { marketRegion: marketRegionNormalizedName, sender_data: senderResult },
      campaign_id: campaignId,
    });
    throw new Error('No active sender found in Supabase or sender data is incomplete.');
  }

  const finalSender: SenderData = {
    sender_email: senderResult.sender_email,
    sender_name: senderResult.sender_name,
    is_default: senderResult.is_default ?? false, // Provide a fallback for is_default
    email: senderResult.email || senderResult.sender_email,
    name: senderResult.name || senderResult.sender_name,
  };

  return finalSender;
}

export async function determineMarketDetails(
  marketRegionNormalizedName: string,
  campaignId?: string
): Promise<MarketDetails> {
  const trimmedMarketRegionName = marketRegionNormalizedName.trim();
  if (!trimmedMarketRegionName) {
    await logSystemEvent({
      event_type: 'ENGINE_SETUP_ERROR',
      message: 'Market region normalized name is empty or invalid for determining lead table.',
      details: { marketRegionNormalizedName },
      campaign_id: campaignId,
    });
    throw new Error('Market region normalized name is required to determine lead table.');
  }
  const leadTableName = `${trimmedMarketRegionName}_fine_cut_leads`;
  return {
    marketRegionNormalizedName: trimmedMarketRegionName,
    leadTableName,
  };
}

export async function fetchAndValidateLead(
  supabase: ReturnType<typeof createAdminServerClient>,
  leadTableName: string,
  marketRegionNormalizedName: string,
  specificLeadIdToTest?: string | number,
  campaignId?: string
): Promise<FineCutLead> {
  let leadToProcess: FineCutLead | null = null;

  if (specificLeadIdToTest) {
    await logSystemEvent({
      event_type: 'ENGINE_LEAD_FETCH_ATTEMPT',
      message: `Attempting to fetch specific lead ID: ${specificLeadIdToTest} from ${leadTableName}.`,
      details: { lead_id: specificLeadIdToTest, table: leadTableName, marketRegion: marketRegionNormalizedName },
      campaign_id: campaignId,
    });
    const { data: specificLead, error: specificLeadError } = await supabase
      .from(leadTableName)
      .select('*')
      .eq('id', specificLeadIdToTest)
      .maybeSingle<FineCutLead>();

    if (specificLeadError) {
      await logSystemEvent({
        event_type: 'ENGINE_LEAD_FETCH_ERROR',
        message: `Database error fetching specific lead ID ${specificLeadIdToTest} from ${leadTableName}: ${specificLeadError.message}`,
        details: { error: specificLeadError, lead_id: specificLeadIdToTest, table: leadTableName, marketRegion: marketRegionNormalizedName },
        campaign_id: campaignId,
      });
      throw new Error(`DB error fetching specific lead ${specificLeadIdToTest}: ${specificLeadError.message}`);
    }
    if (!specificLead) {
      await logSystemEvent({
        event_type: 'ENGINE_LEAD_FETCH_ERROR',
        message: `Specific lead ID ${specificLeadIdToTest} not found in ${leadTableName}.`,
        details: { lead_id: specificLeadIdToTest, table: leadTableName, marketRegion: marketRegionNormalizedName },
        campaign_id: campaignId,
      });
      throw new Error(`Lead ID ${specificLeadIdToTest} not found in ${leadTableName}.`);
    }
    leadToProcess = specificLead;
  } else {
    await logSystemEvent({
      event_type: 'ENGINE_LEAD_FETCH_ATTEMPT',
      message: `Attempting to find a suitable lead by iterating through ${leadTableName}. Max attempts: ${MAX_LEAD_FETCH_ATTEMPTS}.`,
      details: { table: leadTableName, max_attempts: MAX_LEAD_FETCH_ATTEMPTS, marketRegion: marketRegionNormalizedName },
      campaign_id: campaignId,
    });
    for (let attempt = 0; attempt < MAX_LEAD_FETCH_ATTEMPTS; attempt++) {
      const { data: candidateLeads, error: leadFetchError } = await supabase
        .from(leadTableName)
        .select('*')
        .order('id', { ascending: true })
        .range(attempt, attempt);

      if (leadFetchError) {
        await logSystemEvent({
          event_type: 'ENGINE_LEAD_FETCH_ERROR',
          message: `DB error fetching lead (attempt ${attempt + 1}) from ${leadTableName}: ${leadFetchError.message}`,
          details: { error: leadFetchError, attempt: attempt + 1, table: leadTableName, marketRegion: marketRegionNormalizedName },
          campaign_id: campaignId,
        });
        console.error(`DB error on attempt ${attempt + 1} from ${leadTableName}: ${leadFetchError.message}. Continuing attempts.`);
        continue;
      }
      if (!candidateLeads || candidateLeads.length === 0) {
        await logSystemEvent({
          event_type: 'ENGINE_LEAD_FETCH_INFO',
          message: `No more leads available in ${leadTableName} to check (attempt ${attempt + 1}).`,
          details: { table: leadTableName, attempt: attempt + 1, marketRegion: marketRegionNormalizedName },
          campaign_id: campaignId,
        });
        break;
      }
      const candidateLead = candidateLeads[0] as FineCutLead;
      const { isValid: isCandidateValid } = _validateLeadFields(candidateLead, candidateLead.id ?? `attempt_${attempt + 1}`);
      if (isCandidateValid) {
        leadToProcess = candidateLead;
        await logSystemEvent({
          event_type: 'ENGINE_LEAD_FETCH_SUCCESS',
          message: `Suitable lead found after ${attempt + 1} attempts. Lead ID: ${leadToProcess.id}.`,
          details: { lead_id: leadToProcess.id, attempts: attempt + 1, table: leadTableName, marketRegion: marketRegionNormalizedName, original_lead_id: String(leadToProcess.id) },
          campaign_id: campaignId,
        });
        break;
      } else {
        await logSystemEvent({
          event_type: 'ENGINE_LEAD_VALIDATION_SKIPPED',
          message: `Lead ID ${candidateLead.id ?? `attempt_${attempt + 1}`} fetched but failed validation. Skipping.`,
          details: { lead_id: candidateLead.id, table: leadTableName, attempt: attempt + 1, marketRegion: marketRegionNormalizedName, original_lead_id: String(candidateLead.id) },
          campaign_id: campaignId,
        });
      }
    }
    if (!leadToProcess) {
      await logSystemEvent({
        event_type: 'ENGINE_LEAD_FETCH_ERROR',
        message: `No suitable lead found in ${leadTableName} after ${MAX_LEAD_FETCH_ATTEMPTS} attempts.`,
        details: { attempts: MAX_LEAD_FETCH_ATTEMPTS, table: leadTableName, marketRegion: marketRegionNormalizedName },
        campaign_id: campaignId,
      });
      throw new Error(`No suitable lead found in ${leadTableName} after ${MAX_LEAD_FETCH_ATTEMPTS} checks. Ensure leads have all required fields.`);
    }
  }

  const { isValid, errorMessages, validatedLead } = _validateLeadFields(leadToProcess, leadToProcess.id ?? 'unknown');
  if (!isValid || !validatedLead) {
    const leadIdForError = leadToProcess?.id || specificLeadIdToTest || 'unknown';
    await logSystemEvent({
      event_type: 'ENGINE_LEAD_VALIDATION_ERROR',
      message: `Chosen lead ID ${leadIdForError} failed final validation: ${errorMessages.join('; ')}`,
      details: { lead_id: leadIdForError, errors: errorMessages, table: leadTableName, marketRegion: marketRegionNormalizedName, original_lead_id: String(leadIdForError) },
      campaign_id: campaignId,
    });
    throw new Error(`Lead validation failed for ID ${leadIdForError}: ${errorMessages.join('; ')}`);
  }
  
  await logSystemEvent({
    event_type: 'ENGINE_LEAD_VALIDATION_SUCCESS',
    message: `Lead ID ${validatedLead.id} successfully fetched and validated.`,
    details: { lead_id: validatedLead.id, table: leadTableName, marketRegion: marketRegionNormalizedName, original_lead_id: String(validatedLead.id) },
    campaign_id: campaignId,
  });
  return validatedLead;
}

export async function prepareEmailContentAndAssets(
  lead: FineCutLead,
  sender: SenderData,
  // nunjucksEnvInstance is used from the module scope
  baseTemplateDir: string, // This is 'templateDir' from module scope
  campaignId?: string
): Promise<EmailAssets> {
  if (lead.assessed_total === null || typeof lead.assessed_total === 'undefined' || lead.assessed_total <= 0) {
    await logSystemEvent({
      event_type: 'ENGINE_ASSET_PREP_ERROR',
      message: 'Invalid assessed_total for offer generation.',
      details: { lead_id: lead.id, assessed_total: lead.assessed_total, original_lead_id: String(lead.id) },
      campaign_id: campaignId,
    });
    throw new Error('Cannot generate offer details: assessed_total is invalid or missing.');
  }
  if (!lead.contact_name || typeof lead.contact_name !== 'string' || lead.contact_name.trim() === '') {
    await logSystemEvent({
      event_type: 'ENGINE_ASSET_PREP_ERROR',
      message: 'Invalid contact_name for offer generation.',
      details: { lead_id: lead.id, contact_name: lead.contact_name, original_lead_id: String(lead.id) },
      campaign_id: campaignId,
    });
    throw new Error('Cannot generate offer details: contact_name is invalid or missing.');
  }

  const offerDetails = generateOfferDetails(lead.assessed_total, lead.contact_name as string);
  const staticTemplateFields = {
    inspection_period: "7 days (excluding weekends and federal holidays)",
    sender_title: "Acquisitions Specialist",
    company_name: "True Soul Partners LLC",
    current_year: new Date().getFullYear(),
    logo_cid: 'company_logo_cid',
  };
  const templateContext: Record<string, any> = {
    ...lead,
    ...offerDetails,
    sender_name: sender.sender_name,
    sender_email: sender.sender_email,
    ...staticTemplateFields,
    property_address: String(lead.property_address ?? ''),
    property_city: String(lead.property_city ?? ''),
    property_state: String(lead.property_state ?? ''),
    property_postal_code: String(lead.property_postal_code ?? ''),
    contact_name: String(lead.contact_name ?? ''),
  };

  let rawHtmlBodyWithSubject: string;
  try {
    rawHtmlBodyWithSubject = nunjucksEnvInstance.render('email_body_with_subject.html', templateContext);
  } catch (renderError: any) {
    await logSystemEvent({
      event_type: 'ENGINE_TEMPLATE_ERROR',
      message: `Error rendering HTML template (email_body_with_subject.html): ${renderError.message}`,
      details: { error: renderError, lead_id: lead.id, template_context_keys: Object.keys(templateContext), original_lead_id: String(lead.id) },
      campaign_id: campaignId,
    });
    throw new Error(`HTML template rendering failed: ${renderError.message}`);
  }

  const { subject, cleanHtmlBody: htmlBody } = extractSubjectAndCleanHtml(rawHtmlBodyWithSubject, templateContext, nunjucksEnvInstance);
  let textBody: string;
  try {
    textBody = nunjucksEnvInstance.render('letter_of_intent_text.html', templateContext);
  } catch (renderError: any) {
    console.warn(`Nunjucks render error for text template (letter_of_intent_text.html): ${renderError.message}. Using fallback text body.`);
    await logSystemEvent({
      event_type: 'ENGINE_TEMPLATE_WARNING',
      message: `Error rendering text template (letter_of_intent_text.html), using fallback: ${renderError.message}`,
      details: { error: renderError, lead_id: lead.id, original_lead_id: String(lead.id) },
      campaign_id: campaignId,
    });
    textBody = `Please enable HTML to view this email. Offer details for ${templateContext.property_address}.`;
  }

  let logoBuffer: Buffer | undefined;
  let logoContentType: string | undefined;
  try {
    const logoPath = path.join(baseTemplateDir, 'logo.png'); // baseTemplateDir is 'templateDir' from module scope
    logoBuffer = await fs.readFile(logoPath);
    logoContentType = 'image/png';
  } catch (logoError: any) {
    console.warn(`Could not load inline logo (logo.png): ${logoError.message}. Proceeding without logo.`);
    await logSystemEvent({
      event_type: 'ENGINE_ASSET_WARNING',
      message: `Could not load inline logo (logo.png): ${logoError.message}. Proceeding without logo.`,
      details: { error: logoError, template_dir: baseTemplateDir, original_lead_id: String(lead.id) },
      campaign_id: campaignId,
    });
  }
  
  await logSystemEvent({
    event_type: 'ENGINE_ASSET_PREP_SUCCESS',
    message: 'Email content and assets prepared successfully.',
    details: { lead_id: lead.id, subject: subject, has_logo: !!logoBuffer, original_lead_id: String(lead.id) },
    campaign_id: campaignId,
  });

  return {
    subject,
    htmlBody,
    textBody,
    templateContext,
    logoBuffer,
    logoContentType,
  };
}

export async function generatePdfAttachment(
  sendPdf: boolean,
  templateContext: Record<string, any>,
  lead: FineCutLead,
  specificLeadIdToTest?: string | number, // For more accurate lead ID in PDF generation context
  campaignId?: string
): Promise<Buffer | null> {
  if (!sendPdf) {
    await logSystemEvent({
      event_type: 'ENGINE_PDF_GENERATION_SKIPPED',
      message: 'PDF generation was skipped as per request (sendPdf is false).',
      details: { lead_id: lead.id, original_lead_id: String(lead.id) },
      campaign_id: campaignId,
    });
    return null;
  }

  await logSystemEvent({
    event_type: 'ENGINE_PDF_GENERATION_ATTEMPT',
    message: 'Attempting to generate PDF attachment.',
    details: { lead_id: lead.id, original_lead_id: String(lead.id) },
    campaign_id: campaignId,
  });

  const personalizationData: PersonalizationData = {
    property_address: String(templateContext.property_address ?? lead.property_address ?? ''),
    property_city: String(templateContext.property_city ?? lead.property_city ?? ''),
    property_state: String(templateContext.property_state ?? lead.property_state ?? ''),
    property_postal_code: String(templateContext.property_postal_code ?? lead.property_postal_code ?? ''),
    current_date: String(templateContext.currentDateFormatted ?? new Date().toLocaleDateString('en-US')),
    greeting_name: String(templateContext.greetingName ?? lead.contact_name ?? 'Homeowner'),
    offer_price: String(templateContext.offerPriceFormatted ?? 'N/A'),
    inspection_period: String(templateContext.inspection_period ?? 'As per contract'),
    emd_amount: String(templateContext.emdAmountFormatted ?? 'N/A'),
    closing_date: String(templateContext.closingDateFormatted ?? 'To be determined'),
    offer_expiration_date: String(templateContext.offerExpirationDateFormatted ?? 'N/A'),
    sender_name: String(templateContext.sender_name ?? 'N/A'),
    sender_title: String(templateContext.sender_title ?? 'Acquisitions Team'),
    company_name: String(templateContext.company_name ?? 'Our Company LLC'),
  };
  
  const leadIdString = String(specificLeadIdToTest || lead.id || 'unknown_lead_id');
  const contactEmailString = String(lead.contact_email || 'unknown_email');

  try {
    const pdfBuffer = await generateLoiPdf(personalizationData, leadIdString, contactEmailString);
    await logSystemEvent({
      event_type: 'ENGINE_PDF_GENERATION_SUCCESS',
      message: 'PDF attachment generated successfully.',
      details: { 
        lead_id: lead.id, 
        pdf_size_bytes: pdfBuffer.length,
        original_lead_id: String(lead.id),
      },
      campaign_id: campaignId,
    });
    return pdfBuffer;
  } catch (pdfError: any) {
    console.error('Error generating PDF:', pdfError.message);
    await logSystemEvent({
      event_type: 'ENGINE_PDF_GENERATION_ERROR',
      message: `Failed to generate PDF: ${pdfError.message}`,
      details: { 
        error: pdfError, 
        lead_id: lead.id, 
        personalization_keys: Object.keys(personalizationData),
        original_lead_id: String(lead.id),
      },
      campaign_id: campaignId,
    });
    throw new Error(`Failed to generate PDF attachment: ${pdfError.message}`);
  }
}

export async function sendEmailAndLogOutcome(params: EmailDispatchFullParams): Promise<{ success: boolean; error?: string }> {
  const {
    supabase,
    sender,
    lead,
    emailAssets,
    pdfBuffer,
    recipientEmail,
    campaignId,
    marketRegionNormalizedName,
  } = params;

  const logEntry: Omit<EmailLogEntry, 'id' | 'created_at' | 'status' | 'error_message' | 'email_sent_at'> = {
    event_type: 'TEST_EMAIL_ATTEMPT', // This should be dynamic if used for actual campaigns
    subject: emailAssets.subject,
    from_address: sender.sender_email,
    to_address: recipientEmail,
    lead_id: lead.id,
    original_lead_id: String(lead.id),
    campaign_id: campaignId,
    market_region_normalized_name: marketRegionNormalizedName,
    emitted_by: 'test-email-api', // This should be dynamic
    send_to_lead: lead.contact_email === recipientEmail, // Check primary contact email
    pdf_attached: pdfBuffer ? true : false,
    // Populate other EmailLogEntry fields from lead and context
    contact_name: lead.contact_name,
    contact_email: lead.contact_email,
    property_address: lead.property_address,
    // ... (add other relevant fields from FineCutLead to EmailLogEntry)
  };

  try {
    const attachmentsForGmail: Array<{ filename: string; content: Buffer; contentType?: string; contentId?: string }> = [];
    if (pdfBuffer) {
      attachmentsForGmail.push({
        filename: `LOI_${String(lead.property_address)?.replace(/\s+/g, '_') || 'property'}.pdf`,
        content: pdfBuffer,
        contentType: 'application/pdf',
      });
    }
    if (emailAssets.logoBuffer && emailAssets.logoContentType && emailAssets.templateContext.logo_cid) {
      attachmentsForGmail.push({
        filename: 'logo.png',
        content: emailAssets.logoBuffer,
        contentType: emailAssets.logoContentType,
        contentId: String(emailAssets.templateContext.logo_cid).replace(/[<>]/g, ''),
      });
    }

    await sendGmailService(
      sender.sender_email,
      recipientEmail,
      emailAssets.subject,
      emailAssets.htmlBody,
      attachmentsForGmail.length > 0 ? attachmentsForGmail : undefined,
      emailAssets.textBody // Added textBody to sendGmailService call
    );

    await supabase.from('engine_log').insert([{
      ...logEntry,
      email_status: 'SENT',
      message: `Test email successfully sent to ${recipientEmail} for lead ${lead.id}.`,
      email_sent_at: new Date().toISOString(),
    } as EmailLogEntry]); // Cast to EmailLogEntry to ensure all fields align
    
    await logSystemEvent({
      event_type: 'ENGINE_TEST_EMAIL_SUCCESS',
      message: `Test email successfully sent to ${recipientEmail} for lead ${lead.id}. Subject: ${emailAssets.subject}`,
      details: { leadId: lead.id, recipient: recipientEmail, sender: sender.sender_email, subject: emailAssets.subject, market: marketRegionNormalizedName, campaignId, original_lead_id: String(lead.id) },
      campaign_id: campaignId,
    });
    return { success: true };

  } catch (emailError: any) {
    console.error(`Failed to send email to ${recipientEmail}:`, emailError);
    await supabase.from('engine_log').insert([{
      ...logEntry,
      email_status: 'ERROR',
      message: `Failed to send email to ${recipientEmail} for lead ${lead.id}: ${emailError.message}`,
      email_error_message: emailError.message,
      email_sent_at: new Date().toISOString(), // Log time of attempt
    } as EmailLogEntry]);

    await logSystemEvent({
      event_type: 'ENGINE_EMAIL_SEND_ERROR',
      message: `Failed to send email to ${recipientEmail} for lead ${lead.id}: ${emailError.message}`,
      details: { lead_id: lead.id, error: emailError, recipient: recipientEmail, marketRegion: marketRegionNormalizedName, original_lead_id: String(lead.id) },
      campaign_id: campaignId,
    });
    return { success: false, error: emailError.message };
  }
}
// --- END Exported Logic Functions ---
