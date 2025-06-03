// src/app/api/engine/test-email/route.ts
import fs from 'fs/promises';
import path from 'path';

import { NextRequest, NextResponse } from 'next/server';
import { configure, Environment as NunjucksEnvironment } from 'nunjucks'; // Imported NunjucksEnvironment for typing

// IMPORTANT: Ensure these paths are correct according to your tsconfig.json 'paths' and actual file locations.
import { createAdminServerClient } from '@/utils/supabase-admin'; // Assuming this path and export are correct
import { Database, FineCutLead } from '@/types/supabase';
import { isValidEmail as validateEmailFromUtils } from '@/app/api/engine/_utils/_utils'; // Using absolute path
import { generateLoiPdf, PersonalizationData, sendEmail as sendGmailService } from '@/services';
import { logSystemEvent } from '@/services/logService';
import { OfferDetails, generateOfferDetails } from '@/actions/offerCalculations';

// Define SenderData interface
interface SenderData {
  sender_name: string;
  sender_email: string;
  email: string;
  name: string;
  credentials_json: string;
  is_default: boolean;
}

// Nunjucks environment setup
const templateDir = path.join(process.cwd(), 'src', 'app', 'api', 'engine', 'templates');
const nunjucksEnv: NunjucksEnvironment = configure(templateDir, { autoescape: true });

// Hardcoded sender details (consider moving to a config or fetching dynamically)
const TEST_SENDER_EMAIL = process.env.TEST_SENDER_EMAIL || 'chrisphillips@truesoulpartners.com';
const TEST_SENDER_NAME = process.env.TEST_SENDER_NAME || 'Chris Phillips';
const TEST_RECIPIENT_EMAIL = process.env.TEST_RECIPIENT_EMAIL || 'chrisphillips@truesoulpartners.com';
const TEST_RECIPIENT_NAME = process.env.TEST_RECIPIENT_NAME || 'Test Recipient';

// Type for logging
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
  email_status: string;
  email_error_message?: string | null;
  email_sent_at?: string | null;
  campaign_id?: string | null;
  campaign_run_id?: string | null;
  converted?: boolean | null;
  [key: string]: any;
}

// Simplified MIME message creation function
const createMimeMessage = (
  to: string,
  from: string,
  fromName: string,
  subject: string,
  htmlBody: string,
  pdfAttachment?: { filename: string; content: Buffer },
  inlineLogo?: { contentId: string; contentType: string; content: Buffer }
): string => {
  const boundary = `----=_Part_Boundary_${Math.random().toString(36).substring(2)}`;
  
  let email = `From: "${fromName}" <${from}>\r\n`;
  email += `To: ${to}\r\n`;
  email += `Subject: ${subject}\r\n`;
  email += `MIME-Version: 1.0\r\n`;
  email += `Content-Type: multipart/related; boundary="${boundary}"\r\n\r\n`;

  // HTML part
  email += `--${boundary}\r\n`;
  email += `Content-Type: text/html; charset="utf-8"\r\n`;
  email += `Content-Transfer-Encoding: 7bit\r\n\r\n`;
  email += `${htmlBody}\r\n\r\n`;

  // Inline Logo part
  if (inlineLogo && inlineLogo.content && inlineLogo.contentType) {
    email += `--${boundary}\r\n`;
    email += `Content-Type: ${inlineLogo.contentType}; name="logo.png"\r\n`;
    email += `Content-Transfer-Encoding: base64\r\n`;
    email += `Content-ID: <${inlineLogo.contentId}>\r\n`;
    email += `Content-Disposition: inline; filename="logo.png"\r\n\r\n`;
    email += `${inlineLogo.content.toString('base64')}\r\n\r\n`;
  }
  
  // PDF attachment part
  if (pdfAttachment) {
    email += `--${boundary}\r\n`;
    email += `Content-Type: application/pdf; name="${pdfAttachment.filename}"\r\n`;
    email += `Content-Disposition: attachment; filename="${pdfAttachment.filename}"\r\n`;
    email += `Content-Transfer-Encoding: base64\r\n\r\n`;
    email += `${pdfAttachment.content.toString('base64')}\r\n\r\n`;
  }

  email += `--${boundary}--`;
  return email;
};

// Helper function to extract subject and clean HTML
const extractSubjectAndCleanHtml = (
  renderedHtmlWithComment: string,
  context: Record<string, any>,
  nunjucks: NunjucksEnvironment
): { subject: string; cleanHtmlBody: string } => {
  const subjectRegex = /<!-- SUBJECT: (.*?) -->/s; // Added 's' flag for multiline subjects if any
  const match = renderedHtmlWithComment.match(subjectRegex);
  let subject = `Offer for ${context.property_address || 'Your Property'}`; // Default subject with fallback
  let cleanHtmlBody = renderedHtmlWithComment;

  if (match && match[1]) {
    try {
      subject = nunjucks.renderString(match[1].trim(), context);
    } catch (e: any) {
      console.error(`Error rendering subject template: "${match[1].trim()}"`, e);
      // Fallback to the raw extracted subject or the default if rendering fails
      subject = match[1].trim() || subject;
    }
    cleanHtmlBody = renderedHtmlWithComment.replace(subjectRegex, '').trim();
  }
  return { subject, cleanHtmlBody };
};

export async function POST(request: NextRequest) {
  const supabase = await createAdminServerClient();

  // Helper for logging within this handler's scope
  const logToSupabase = async (logData: Partial<EmailLogEntry>) => {
    try {
      const { error } = await supabase.from('engine_log').insert([logData]);
      if (error) {
        console.error('Error in final catch block of POST handler:', (error as Error).message);
      }
    } catch (error) {
      console.error('Error in logToSupabase (within POST):', (error as Error).message);
    }
  };

  let requestBody;
  try {
    requestBody = await request.json();
  } catch (error) {
    return NextResponse.json({ error: 'Invalid JSON in request body' }, { status: 400 });
  }

  const { marketRegionNormalizedName, leadId: specificLeadIdToTest, sendPdf = true, sendToLead = false } = requestBody;

  if (!marketRegionNormalizedName || typeof marketRegionNormalizedName !== 'string' || marketRegionNormalizedName.trim() === '') {
    return NextResponse.json({ error: 'marketRegionNormalizedName is required and must be a non-empty string.' }, { status: 400 });
  }
  const leadTableName = `${marketRegionNormalizedName.trim()}_fine_cut_leads`;

  try {
    // 1. Fetch Active Sender
    const { data: senderData, error: senderError } = await supabase
      .from('senders')
      .select('sender_email, sender_name, created_at')
      .eq('is_active', true)
      .eq('status', 'active')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle<SenderData>();

    const sender = senderData;

    if (senderError) {
      console.error('Supabase error fetching sender:', (senderError as Error).message);
      await logSystemEvent({
        event_type: 'ENGINE_TEST_EMAIL_ERROR',
        message: `Error fetching active sender: ${(senderError as Error).message}`,
        details: { error: senderError, marketRegion: marketRegionNormalizedName, leadTableName },
        campaign_id: requestBody.campaignId
      });
      return NextResponse.json({ success: false, error: `Error fetching active sender: ${(senderError as Error).message}` }, { status: 500 });
    }
    if (!sender) {
      await logSystemEvent({
        event_type: 'ENGINE_TEST_EMAIL_INFO',
        message: `No active sender found in ${marketRegionNormalizedName} for test email.`,
        details: { marketRegion: marketRegionNormalizedName, leadTableName },
        campaign_id: requestBody.campaignId
      });
      return NextResponse.json({ success: false, error: 'No active sender found in Supabase.' }, { status: 404 });
    }

    let lead: FineCutLead | null = null;
    const batchSize = 1;
    const MAX_LEAD_FETCH_ATTEMPTS = 20;

    for (let attempt = 0; attempt < MAX_LEAD_FETCH_ATTEMPTS; attempt++) {
      const { data: candidateLeads, error: leadFetchError } = await supabase
        .from(leadTableName)
        .select('*')
        .order('id', { ascending: true })
        .range(attempt, attempt + batchSize - 1);

      if (leadFetchError) {
        console.error(`Error fetching lead for test email (attempt ${attempt + 1}):`, (leadFetchError as Error).message);
        await logSystemEvent({
          event_type: 'ENGINE_TEST_EMAIL_ERROR',
          message: `DB error fetching lead (attempt ${attempt + 1}) from ${leadTableName} for test email: ${(leadFetchError as Error).message}`,
          details: { error: leadFetchError, marketRegion: marketRegionNormalizedName, leadTableName },
          campaign_id: requestBody.campaignId
        });
        return NextResponse.json({ success: false, error: 'Database error while fetching leads for test.' }, { status: 500 });
      }

      if (!candidateLeads || candidateLeads.length === 0) {
        await logSystemEvent({
          event_type: 'ENGINE_TEST_EMAIL_INFO',
          message: `No more leads available in ${marketRegionNormalizedName} to check for test email.`,
          details: { marketRegion: marketRegionNormalizedName, leadTableName },
          campaign_id: requestBody.campaignId
        });
        break;
      }

      const candidateLead = candidateLeads[0];

      if (
        candidateLead.contact_name &&
        candidateLead.contact_email &&
        candidateLead.property_address &&
        candidateLead.property_city &&
        candidateLead.property_state &&
        candidateLead.property_postal_code &&
        candidateLead.assessed_total !== null && typeof candidateLead.assessed_total === 'number'
      ) {
        lead = candidateLead;
        break;
      }
    }

    if (!lead) {
      await logSystemEvent({
        event_type: 'ENGINE_TEST_EMAIL_WARNING',
        message: `No suitable lead found in ${marketRegionNormalizedName} after checking ${MAX_LEAD_FETCH_ATTEMPTS} leads for test email.`,
        details: {
          marketRegion: marketRegionNormalizedName,
          attempts: MAX_LEAD_FETCH_ATTEMPTS,
          leadTableName
        },
        campaign_id: requestBody.campaignId
      });
      return NextResponse.json({ success: false, error: `No suitable lead found in ${marketRegionNormalizedName} to use for the test email after checking up to ${MAX_LEAD_FETCH_ATTEMPTS} leads. Ensure leads have all required fields: contact_name, contact_email, property_address, city, state, postal_code, assessed_total.` }, { status: 404 });
    }

    const leadIdForApiResponse = lead.id;

    const activeSenderEmail = sender.sender_email;
    const activeSenderName = sender.sender_name;

    let actualLeadEmail: string | undefined | null = null;
    if (lead.contact_email && validateEmailFromUtils(lead.contact_email)) {
      actualLeadEmail = lead.contact_email;
    }

    const intendedRecipientEmail = sendToLead && actualLeadEmail ? actualLeadEmail : TEST_RECIPIENT_EMAIL;
    const recipientName = sendToLead ? (lead.contact_name as string) : (TEST_RECIPIENT_NAME || 'Test Recipient');

    const essentialLeadFieldKeys: (keyof typeof lead)[] = ['property_address', 'property_city', 'property_state', 'contact_name', 'assessed_total'];
    const missingFields: string[] = [];
    essentialLeadFieldKeys.forEach(key => {
      const value = lead[key];
      if (key === 'contact_name') {
        if (String(value).trim() === '') missingFields.push(String(key));
      } else if (key === 'assessed_total') {
        if (value === null || typeof value === 'undefined') missingFields.push(String(key));
        else {
          const numValue = parseFloat(String(value));
          if (isNaN(numValue) || numValue <= 0) missingFields.push(`${String(key)} (must be a positive number)`);
        }
      } else {
        if (value === null || typeof value === 'undefined' || (typeof value === 'string' && String(value).trim() === '')) {
          missingFields.push(String(key));
        }
      }
    });
    const { property_postal_code, assessed_total } = lead;
    if (!property_postal_code || String(property_postal_code).trim() === '') {
      missingFields.push('property_postal_code');
    }
    if (assessed_total === null || typeof assessed_total === 'undefined' || assessed_total <= 0) {
      missingFields.push('assessed_total (must be a positive number for offer calculation)');
    }

    if (missingFields.length > 0) {
      const errorMessage = `Missing/invalid essential lead data: ${missingFields.join(', ')}`;
      await logToSupabase({ original_lead_id: String(specificLeadIdToTest) || 'N/A_NO_LEAD_ID', property_address: 'N/A_NO_LEAD_DATA', email_status: 'ERROR_CLIENT', email_error_message: 'No lead found with provided criteria.' });
      return NextResponse.json({ success: false, error: errorMessage, lead_id: leadIdForApiResponse, missing_fields: missingFields }, { status: 400 });
    }

    // Ensure assessed_total is a number before calling generateOfferDetails
    // The lead fetching loop should already guarantee this, but an explicit check adds safety.
    if (lead.assessed_total === null || typeof lead.assessed_total === 'undefined') {
      const errorMessage = 'Assessed total is missing or invalid for offer calculation.';
      console.error(errorMessage, { lead_id: lead.id });
      await logSystemEvent({
        event_type: 'ENGINE_TEST_EMAIL_ERROR',
        message: errorMessage,
        details: { lead_id: lead.id, assessed_total: lead.assessed_total },
        original_lead_id: String(lead.id),
        campaign_id: requestBody.campaignId
      });
      return NextResponse.json({ success: false, error: errorMessage, lead_id: lead.id }, { status: 400 });
    }
    const offerDetails: OfferDetails = generateOfferDetails(lead.assessed_total, lead.contact_name as string);

    const staticPdfFields = {
      inspection_period: "7 days (excluding weekends and federal holidays)",
      sender_title: "Acquisitions Specialist",
      company_name: "True Soul Partners LLC",
    };

    const templateContext: Record<string, any> = {
      property_address: lead.property_address,
      property_city: lead.property_city,
      property_state: lead.property_state,
      property_postal_code: lead.property_postal_code ?? '', // Ensure string for template
      ...offerDetails,
      sender_name: activeSenderName,
      sender_email: activeSenderEmail,
      ...staticPdfFields,
      current_year: new Date().getFullYear(),
      logo_cid: 'company_logo_cid'
    };

    const rawHtmlBodyWithSubject = nunjucksEnv.render('email_body_with_subject.html', templateContext);
    const { subject, cleanHtmlBody: htmlBody } = extractSubjectAndCleanHtml(rawHtmlBodyWithSubject, templateContext, nunjucksEnv);

    let textBody = '';
    try {
      textBody = nunjucksEnv.render('letter_of_intent_text.html', templateContext);
    } catch (renderError: any) {
      console.warn(`Nunjucks render error for text template letter_of_intent_text.html: ${(renderError as Error).message}. Using fallback text body.`);
      textBody = `Please enable HTML to view this email. Offer details for ${templateContext.property_address}.`;
    }

    let pdfBuffer: Buffer | null = null;
    if (sendPdf) {
      try {
        const personalizationData: PersonalizationData = {
          property_address: String(templateContext.property_address ?? ''),
          property_city: String(templateContext.property_city ?? ''),
          property_state: String(templateContext.property_state ?? ''),
          property_postal_code: String(templateContext.property_postal_code ?? ''),
          current_date: String(templateContext.currentDateFormatted ?? ''),
          greeting_name: String(templateContext.greetingName ?? ''),
          offer_price: String(templateContext.offerPriceFormatted ?? ''),
          inspection_period: String(templateContext.inspection_period ?? ''),
          emd_amount: String(templateContext.emdAmountFormatted ?? ''),
          closing_date: String(templateContext.closingDateFormatted ?? ''),
          offer_expiration_date: String(templateContext.offerExpirationDateFormatted ?? ''),
          sender_name: String(templateContext.sender_name ?? ''),
          sender_title: String(templateContext.sender_title ?? ''),
          company_name: String(templateContext.company_name ?? ''),
        };

        const leadIdString = String(specificLeadIdToTest || lead.id || 'unknown');
        const contactEmailString = lead?.contact_email ? String(lead.contact_email) : 'unknown_email'; // Already correct

        pdfBuffer = await generateLoiPdf(personalizationData, leadIdString, contactEmailString);
      } catch (pdfError) {
        console.error('Error generating PDF:', (pdfError as Error).message);
        await logToSupabase({ original_lead_id: specificLeadIdToTest || lead.id || 'N/A', property_address: lead?.property_address || 'N/A', email_status: 'ERROR_SYSTEM', email_error_message: `Email sending failed: ${(pdfError as Error).message}`, campaign_id: null });
        return NextResponse.json({ success: false, error: 'Failed to generate PDF.', lead_id: leadIdForApiResponse, details: (pdfError as Error).message }, { status: 500 });
      }
    }

    let logoBuffer: Buffer | undefined;
    let logoContentType: string | undefined;
    try {
      const logoPath = path.join(templateDir, 'logo.png'); // Assuming logo.png is directly in templateDir based on user file list
      logoBuffer = await fs.readFile(logoPath);
      logoContentType = 'image/png';
    } catch (logoError) {
      console.warn('Could not load inline logo:', (logoError as Error).message);
    }

    const emailMime = createMimeMessage(
      intendedRecipientEmail,
      activeSenderEmail,
      activeSenderName,
      subject,
      htmlBody,
      pdfBuffer ? { filename: `LOI_${String(lead.property_address)?.replace(/\s+/g, '_') || 'property'}.pdf`, content: pdfBuffer } : undefined,
      logoBuffer && logoContentType ? { contentId: templateContext.logo_cid, contentType: logoContentType, content: logoBuffer } : undefined
    );

    // 8. Send Email via Gmail API
    try {
      const attachments = [];
      if (pdfBuffer) {
        attachments.push({
          filename: `LOI_${String(lead.property_address)?.replace(/\s+/g, '_') || 'property'}.pdf`,
          content: pdfBuffer,
        });
      }
      // Note: The current gmailService.sendEmail handles multipart/mixed, best for attachments.
      // Inline images (like the logo) typically use multipart/related.
      // For simplicity, we are not passing the inline logo to this sendEmail function.
      // If inline logo is critical, gmailService.ts would need adjustment or a different approach.

      const emailResult = await sendGmailService(activeSenderEmail, activeSenderName, intendedRecipientEmail, subject, htmlBody, pdfBuffer ? { filename: `LOI_${String(lead.property_address)?.replace(/\s+/g, '_') || 'property'}.pdf`, content: pdfBuffer } : undefined, logoBuffer && logoContentType ? { contentId: templateContext.logo_cid, contentType: logoContentType, content: logoBuffer } : undefined);

      if (emailResult.success) {
        await logToSupabase({
          original_lead_id: lead.id ?? null, // Pass null if undefined
          contact_name: recipientName,
          contact_email: intendedRecipientEmail,
          property_address: lead.property_address,
          // ... (other fields for logging success as before)
          email_status: 'SENT_TEST',
          email_sent_at: new Date().toISOString(),
          campaign_id: 'TEST_EMAIL_CAMPAIGN',
        });

        return NextResponse.json({
          success: true,
          message: `Test email sent successfully to ${intendedRecipientEmail} from ${activeSenderEmail}.`,
          lead_id: leadIdForApiResponse,
          sender_email: activeSenderEmail,
          recipient_email: intendedRecipientEmail,
          subject: subject,
          messageId: emailResult.messageId, // from sendGmail result
        });
      } else {
        throw emailResult.error || new Error("Unknown error from sendGmail");
      }

    } catch (emailError) {
      console.error('Error sending email:', (emailError as Error).message);
      const errorMessage = (emailError as Error).message;
      await logToSupabase({
        original_lead_id: lead.id,
        contact_email: intendedRecipientEmail,
        email_status: 'FAILED_SENDING',
        email_error_message: errorMessage,
        campaign_id: 'TEST_EMAIL_CAMPAIGN',
      });
      return NextResponse.json({ success: false, error: 'Failed to send email via Gmail service.', lead_id: leadIdForApiResponse, details: (emailError as Error).message }, { status: 500 });
    }

  } catch (error) {
    console.error('Overall error in test-email handler:', (error as Error).message);
    const errorMessage = (error as Error).message;
    // Avoid logging again if it was already logged by a specific step's catch block
    // This is a general fallback.
    if (!(error instanceof Error && (error.message.includes("fetching active sender") || error.message.includes("fetching lead")))) {
        await logToSupabase({ email_status: 'ERROR_UNHANDLED', email_error_message: errorMessage, market_region: marketRegionNormalizedName || 'unknown' });
    }
    return NextResponse.json({ success: false, error: `An unexpected error occurred: ${(error as Error).message}` }, { status: 500 });
  }
}
