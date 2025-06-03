// src/app/api/engine/test-email/route.ts
import fs from 'fs/promises';
import path from 'path';

import { SupabaseClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { configure, renderString as nunjucksRenderString } from 'nunjucks';

import { generateOfferDetails, OfferDetails } from '@/actions/offerCalculations';
import { createAdminServerClient } from '@/lib/supabase/server';
import { sendEmail as sendGmail } from '@/services/gmailService';
import { generateLoiPdf, PersonalizationData } from '@/services/pdfService';
import { FineCutLead } from '@/types/leads';

// Define SenderData interface
interface SenderData {
  email: string;
  name: string;
  credentials_json: string; // Or a more specific type like Record<string, any>
  is_default: boolean;
}

// Nunjucks environment setup
// Adjust this path if your templates are located elsewhere.
const templateDir = path.join(process.cwd(), 'src', 'app', 'api', 'engine', 'templates');
// It's good practice to check if the directory exists, especially if dynamic
// For now, assuming it exists or will be created.
const nunjucksEnv = configure(templateDir, { autoescape: true });

// Hardcoded sender details (consider moving to a config or fetching dynamically)
const TEST_SENDER_EMAIL = process.env.TEST_SENDER_EMAIL || 'chrisphillips@truesoulpartners.com';
const TEST_SENDER_NAME = process.env.TEST_SENDER_NAME || 'Chris Phillips';
const TEST_RECIPIENT_EMAIL = process.env.TEST_RECIPIENT_EMAIL || 'chrisphillips@truesoulpartners.com';

// Type for logging (copied from _utils.ts)
export interface Eli5EmailLogEntry {
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

// Simplified MIME message creation function (copied from original test-email.ts)
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
  email += `Content-Type: multipart/related; boundary="${boundary}"\r\n\r\n`; // Changed to multipart/related for inline images

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
  
  // PDF attachment part - should come after related parts if HTML references inline images
  if (pdfAttachment) {
    // If we made the main content multipart/related, we need another multipart/mixed wrapper for attachments
    // For simplicity here, assuming the primary content type change to multipart/related is sufficient
    // and the structure will be: related_boundary -> html -> inline_image -> related_boundary_end -> attachment_boundary -> pdf -> attachment_boundary_end
    // A more robust MIME structure might use multipart/mixed as the outermost, then multipart/related for HTML+inline.
    // For now, keeping it simpler:
    email += `--${boundary}\r\n`; // Re-using the same boundary, which is fine if structured correctly.
                                  // Or use a new boundary for a sub-part.
    email += `Content-Type: application/pdf; name="${pdfAttachment.filename}"\r\n`;
    email += `Content-Disposition: attachment; filename="${pdfAttachment.filename}"\r\n`;
    email += `Content-Transfer-Encoding: base64\r\n\r\n`;
    email += `${pdfAttachment.content.toString('base64')}\r\n\r\n`;
  }

  email += `--${boundary}--`;
  return email;
};

// Email Validation (copied from _utils.ts)
const isValidEmail = (email: string): boolean => {
  if (!email) {
    return false;
  }
  const pattern = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  return pattern.test(email);
};

export async function POST(request: NextRequest) {
  const supabase = await createAdminServerClient();

  // Helper for logging within this handler's scope
  const logToSupabase = async (logData: Partial<Eli5EmailLogEntry>) => {
    try {
      const { error } = await supabase.from('eli5_email_log').insert([logData]);
      if (error) {
        console.error('Failed to log to Supabase:', error);
        // Potentially throw to be caught by the main try-catch, or handle here
      }
    } catch (error) {
      console.error('Error in logToSupabase (within POST):', error);
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
      .select('email, name, credentials_json, is_default') // Removed incorrect FineCutLead generic
      .eq('is_active', true)
      .eq('status', 'active')
      .order('is_default', { ascending: false }) // Prioritize default sender
      .order('created_at', { ascending: true }) // Fallback sort
      .limit(1)
      .maybeSingle<SenderData>(); // Apply SenderData type here

    const sender = senderData; // Keep variable name 'sender' for subsequent code

    if (senderError) {
      console.error('Supabase error fetching sender:', (senderError as Error).message);
      await logToSupabase({ email_status: 'ERROR_SYSTEM', email_error_message: `Error fetching active sender: ${(senderError as Error).message}` });
      return NextResponse.json({ success: false, error: `Error fetching active sender: ${(senderError as Error).message}` }, { status: 500 });
    }
    if (!sender) {
      await logToSupabase({ email_status: 'ERROR_SYSTEM', email_error_message: 'No active sender found.' });
      return NextResponse.json({ success: false, error: 'No active sender found in Supabase.' }, { status: 404 });
    }

    const activeSenderEmail = sender.email;
    const activeSenderName = sender.name;

    // 2. Fetch Sample Lead
    let leadQueryBuilder = supabase
      .from(leadTableName)
      .select('*');

    if (specificLeadIdToTest) {
      leadQueryBuilder = leadQueryBuilder.eq('id', specificLeadIdToTest);
    } else {
      // If no specific lead ID, fetch one that has a usable email
      leadQueryBuilder = leadQueryBuilder.or(
        `and(contact_email.is.not.null,contact_email.neq.'')`
      );
      // Order by ID to get a consistent lead if multiple match
      leadQueryBuilder = leadQueryBuilder.order('id', { ascending: true });
    }

    const { data: lead, error: leadError } = await leadQueryBuilder.limit(1).maybeSingle<FineCutLead>();

    if (leadError) {
      console.error(`Supabase error fetching lead from ${leadTableName}:`, (leadError as Error).message);
      await logToSupabase({ email_status: 'ERROR_LEAD_FETCH', email_error_message: `Error fetching lead: ${(leadError as Error).message}`, market_region: marketRegionNormalizedName });
      return NextResponse.json({ success: false, error: `Error fetching lead from ${leadTableName}: ${(leadError as Error).message}` }, { status: 500 });
    }
    if (!lead) {
      const message = specificLeadIdToTest ? `No lead found with ID ${specificLeadIdToTest} in ${leadTableName}.` : `No lead found in ${leadTableName} for testing.`;
      console.warn(message);
      await logToSupabase({ email_status: 'ERROR_LEAD_NOT_FOUND', email_error_message: message, market_region: marketRegionNormalizedName });
      return NextResponse.json({ success: false, error: message }, { status: 404 });
    }
    
    // Ensure contact_name is a string
    if (lead.contact_name === null || typeof lead.contact_name === 'undefined') {
      lead.contact_name = ""; 
    } else {
      lead.contact_name = String(lead.contact_name); // Ensure it's a string type
    }

    const leadIdForApiResponse = lead.id;
    let actualLeadEmail: string | undefined | null = null;
    // The check for !lead happens right after fetching, so lead is guaranteed to be defined here.
    if (lead.contact_email && isValidEmail(lead.contact_email)) {
      actualLeadEmail = lead.contact_email;
    }

    const intendedRecipientEmail = sendToLead && actualLeadEmail ? actualLeadEmail : TEST_RECIPIENT_EMAIL;
    const recipientName = sendToLead ? lead.contact_name : "Test Recipient"; // If sendToLead, use lead's name for personalization.


    // 3. Validate Essential Lead Fields
    const essentialLeadFieldKeys: (keyof typeof lead)[] = ['property_address', 'property_city', 'property_state', 'contact_name', 'assessed_total'];
    const missingFields: string[] = [];
    essentialLeadFieldKeys.forEach(key => {
      const value = lead[key];
      if (key === 'contact_name') { // Already ensured it's a string
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

    // 4. Generate Offer Details & Prepare Email/PDF Context
    if (lead.assessed_total === null || typeof lead.assessed_total === 'undefined') {
      // This should ideally be caught by the missingFields check earlier, but as a safeguard:
      return NextResponse.json({ success: false, error: 'assessed_total is missing or invalid for offer calculation.', lead_id: leadIdForApiResponse }, { status: 400 });
    }
    const offerDetails: OfferDetails = generateOfferDetails(lead.assessed_total, lead.contact_name);

    const staticPdfFields = {
      inspection_period: "7 days (excluding weekends and federal holidays)",
      sender_title: "Acquisitions Specialist",
      company_name: "True Soul Partners LLC",
    };

    const templateContext = {
      // Lead specific fields (direct)
      property_address: lead.property_address,
      property_city: lead.property_city,
      property_state: lead.property_state,
      property_postal_code: lead.property_postal_code,
      // Calculated offer details
      ...offerDetails, // Includes offerPriceFormatted, emdAmountFormatted, closingDateFormatted, greetingName, offerExpirationDateFormatted, currentDateFormatted
      // Sender details
      sender_name: activeSenderName,
      sender_email: activeSenderEmail, // For email template if needed, not typically in PDF LOI text
      // Static PDF fields
      ...staticPdfFields,
      // Other dynamic data for templates
      current_year: new Date().getFullYear(), // For email template if needed
      logo_cid: 'company_logo_cid' // Content-ID for the inline logo in email
    };

    const emailSubject = nunjucksEnv.render('subject_template.njk', templateContext);
    const emailHtmlBody = nunjucksEnv.render('body_template.njk', templateContext);

    // This section is now part of the refactored step 5 above.
    // The original line was: "// 5. Generate PDF (optional)"
    // The new content for PDF generation is integrated into the `personalizationData` mapping.
    // The actual call to `generateLoiPdf` remains, but its data source is `personalizationData`.
    let pdfBuffer: Buffer | null = null;
    if (sendPdf) {
      try {
        // Convert lead data to PersonalizationData format
        // 5. Generate PDF (optional)
        // PersonalizationData for PDF now uses the already prepared templateContext
        const personalizationData: PersonalizationData = {
          property_address: templateContext.property_address ?? undefined,
          property_city: templateContext.property_city ?? undefined,
          property_state: templateContext.property_state ?? undefined,
          property_postal_code: templateContext.property_postal_code ?? undefined,
          current_date: templateContext.currentDateFormatted ?? undefined,
          greeting_name: templateContext.greetingName ?? undefined,
          offer_price: templateContext.offerPriceFormatted ?? undefined,
          inspection_period: templateContext.inspection_period ?? undefined,
          emd_amount: templateContext.emdAmountFormatted ?? undefined,
          closing_date: templateContext.closingDateFormatted ?? undefined,
          offer_expiration_date: templateContext.offerExpirationDateFormatted ?? undefined,
          sender_name: templateContext.sender_name ?? undefined,
          sender_title: templateContext.sender_title ?? undefined,
          company_name: templateContext.company_name ?? undefined,
        };
        
        const leadId = specificLeadIdToTest || lead?.normalized_lead_id || 'unknown';
        const contactEmail = lead?.contact_email || 'unknown'; // Only use contact_email
        pdfBuffer = await generateLoiPdf(personalizationData, leadId, contactEmail);
      } catch (pdfError) {
        console.error('Error generating PDF:', (pdfError as Error).message);
        await logToSupabase({ original_lead_id: specificLeadIdToTest || lead?.normalized_lead_id || 'N/A', property_address: lead?.property_address || 'N/A', email_status: 'ERROR_SYSTEM', email_error_message: `PDF generation failed: ${(pdfError as Error).message}`, campaign_id: null });
        return NextResponse.json({ success: false, error: 'Failed to generate PDF.', lead_id: leadIdForApiResponse, details: (pdfError as Error).message }, { status: 500 });
      }
    }
    
    // 6. Load Inline Logo
    let logoBuffer: Buffer | undefined;
    let logoContentType: string | undefined;
    try {
        const logoPath = path.join(templateDir, 'assets', 'logo.png'); // Adjust path as needed
        logoBuffer = await fs.readFile(logoPath);
        logoContentType = 'image/png'; // Or detect dynamically
    } catch (logoError) {
        console.warn('Could not load inline logo:', (logoError as Error).message);
        // Continue without logo if it fails, or handle as critical error
    }


    // 7. Create MIME Message
    const emailMime = createMimeMessage(
      intendedRecipientEmail,
      activeSenderEmail,
      activeSenderName,
      emailSubject,
      emailHtmlBody,
      pdfBuffer ? { filename: `LOI_${lead.property_address?.replace(/\s+/g, '_') || 'property'}.pdf`, content: pdfBuffer } : undefined,
      logoBuffer && logoContentType ? { contentId: templateContext.logo_cid, contentType: logoContentType, content: logoBuffer } : undefined
    );

// 8. Send Email via Gmail API
try {
  const attachments = [];
  if (pdfBuffer) {
    attachments.push({
      filename: `LOI_${lead.property_address?.replace(/\s+/g, '_') || 'property'}.pdf`,
      content: pdfBuffer,
    });
  }
  // Note: The current gmailService.sendEmail handles multipart/mixed, best for attachments.
  // Inline images (like the logo) typically use multipart/related.
  // For simplicity, we are not passing the inline logo to this sendEmail function.
  // If inline logo is critical, gmailService.ts would need adjustment or a different approach.

  const emailResult = await sendGmail(
    activeSenderEmail,    // impersonatedUserEmail
    intendedRecipientEmail, // recipientEmail
    emailSubject,         // subject
    emailHtmlBody,        // htmlBody
    attachments           // attachments array
  );

  if (emailResult.success) {
    await logToSupabase({
      original_lead_id: lead.normalized_lead_id,
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
      subject: emailSubject,
      messageId: emailResult.messageId, // from sendGmail result
    });
  } else {
    throw emailResult.error || new Error("Unknown error from sendGmail");
  }

} catch (emailError) {
  console.error('Error sending email:', (emailError as Error).message);
  const errorMessage = (emailError as Error).message;
  await logToSupabase({
    original_lead_id: lead.normalized_lead_id,
    contact_email: intendedRecipientEmail,
    email_status: 'FAILED_SENDING',
    email_error_message: errorMessage,
    campaign_id: 'TEST_EMAIL_CAMPAIGN',
  });
  return NextResponse.json({ success: false, error: 'Failed to send email via Gmail service.', lead_id: leadIdForApiResponse, details: errorMessage }, { status: 500 });
}

  } catch (error) {
    console.error('Overall error in test-email handler:', (error as Error).message);
    const errorMessage = (error as Error).message;
    // Avoid logging again if it was already logged by a specific step's catch block
    // This is a general fallback.
    if (!(error instanceof Error && (error.message.includes("fetching active sender") || error.message.includes("fetching lead")))) {
        await logToSupabase({ email_status: 'ERROR_UNHANDLED', email_error_message: errorMessage, market_region: marketRegionNormalizedName || 'unknown' });
    }
    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 });
  }
}
