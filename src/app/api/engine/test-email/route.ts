// src/app/api/engine/test-email/route.ts
import fs from 'fs/promises';
import path from 'path';

import { NextRequest, NextResponse } from 'next/server';
import { configure as nunjucksConfigure } from 'nunjucks';

import { createAdminServerClient } from '@/lib/supabase/server';
import { sendEmail as sendGmail } from '@/services/gmailService';
// Using relative path for pdfService as a workaround for @/ alias resolution issues.
// Please check tsconfig.json paths configuration for @/services/*
import { generateLoiPdf, PersonalizationData } from '../../../../services/pdfService';

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
const nunjucksEnv = nunjucksConfigure(templateDir, { autoescape: true });

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


// Define an interface for the expected lead structure
interface FineCutLead {
  id: number;
  normalized_lead_id?: string | null;
  contact_name?: string | null;
  contact1_name?: string | null;
  contact2_name?: string | null;
  contact3_name?: string | null;
  contact_email?: string | null;
  contact1_email_1?: string | null;
  contact2_email_1?: string | null;
  contact3_email_1?: string | null;
  property_address?: string | null;
  property_city?: string | null;
  property_state?: string | null;
  property_postal_code?: string | null;
  zip_code?: string | null; 
  property_zipcode?: string | null; 
  assessed_total?: number | null;
  offer_price?: string | null; 
  closing_date_preference?: string | null;
  inspection_period?: string | null;
  offer_expiration_date?: string | null;
  current_date?: string | null; 
  greeting_name?: string | null; 
  [key: string]: any; 
}

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
      console.error('Supabase error fetching sender:', senderError);
      await logToSupabase({ email_status: 'ERROR_SYSTEM', email_error_message: `Error fetching active sender: ${senderError instanceof Error ? senderError.message : String(senderError)}` });
      return NextResponse.json({ success: false, error: `Error fetching active sender: ${senderError instanceof Error ? senderError.message : String(senderError)}` }, { status: 500 });
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
      .select('*'); // Apply generic for row type

    if (specificLeadIdToTest) {
      leadQueryBuilder = leadQueryBuilder.eq('id', specificLeadIdToTest);
    }

    const { data: lead, error: leadError } = await leadQueryBuilder.limit(1).maybeSingle<FineCutLead>();

    if (leadError) {
      console.error(`Supabase error fetching lead from ${leadTableName}:`, leadError);
      await logToSupabase({ email_status: 'ERROR_LEAD_FETCH', email_error_message: `Error fetching lead: ${leadError.message}`, market_region: marketRegionNormalizedName });
      return NextResponse.json({ success: false, error: `Error fetching lead from ${leadTableName}: ${leadError instanceof Error ? leadError.message : String(leadError)}` }, { status: 500 });
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
    const intendedRecipientEmail = sendToLead && lead.contact_email && isValidEmail(lead.contact_email) ? lead.contact_email : TEST_RECIPIENT_EMAIL;
    const recipientName = sendToLead ? lead.contact_name : "Test Recipient";


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
    const { property_postal_code, zip_code, property_zipcode } = lead;
    if ((!property_postal_code || String(property_postal_code).trim() === '') && 
        (!zip_code || String(zip_code).trim() === '') && 
        (!property_zipcode || String(property_zipcode).trim() === '')) {
      missingFields.push('property_zip_code (source)');
    }

    if (missingFields.length > 0) {
      const errorMessage = `Missing/invalid essential lead data: ${missingFields.join(', ')}`;
      await logToSupabase({ original_lead_id: String(specificLeadIdToTest) || 'N/A_NO_LEAD_ID', property_address: 'N/A_NO_LEAD_DATA', email_status: 'ERROR_CLIENT', email_error_message: 'No lead found with provided criteria.' });
      return NextResponse.json({ success: false, error: errorMessage, lead_id: leadIdForApiResponse, missing_fields: missingFields }, { status: 400 });
    }

    // 4. Prepare Email Content using Nunjucks
    const templateContext = {
      ...lead, // Spread all lead properties into the context
      contact_name: recipientName, // Use the potentially overridden recipient name
      sender_name: activeSenderName,
      sender_email: activeSenderEmail,
      // Add any other dynamic data needed by templates
      current_year: new Date().getFullYear(),
      logo_cid: 'truesoul_logo_cid' // Content-ID for the inline logo
    };

    const emailSubject = nunjucksEnv.render('subject_template.njk', templateContext);
    const emailHtmlBody = nunjucksEnv.render('body_template.njk', templateContext);

    // 5. Generate PDF (optional)
    let pdfBuffer: Buffer | undefined = undefined;
    if (sendPdf) {
      try {
        // Convert lead data to PersonalizationData format
        const personalizationData: PersonalizationData = {
          property_address: lead.property_address || undefined,
          property_city: lead.property_city || undefined,
          property_state: lead.property_state || undefined,
          property_postal_code: lead.property_postal_code || lead.zip_code || lead.property_zipcode || undefined,
          current_date: lead.current_date || undefined,
          greeting_name: lead.greeting_name || lead.contact_name || lead.contact1_name || undefined,
          offer_price: lead.offer_price || undefined,
          closing_date_preference: lead.closing_date_preference || undefined,
          inspection_period: lead.inspection_period || undefined,
          offer_expiration_date: lead.offer_expiration_date || undefined,
          sender_name: activeSenderName || undefined,
          contact_name: lead.contact_name || lead.contact1_name || undefined
        };
        
        const leadId = specificLeadIdToTest || lead?.normalized_lead_id || 'unknown';
        const contactEmail = lead?.contact_email || lead?.contact1_email_1 || 'unknown';
        pdfBuffer = await generateLoiPdf(personalizationData, leadId, contactEmail);
      } catch (pdfError) {
        console.error('Error generating PDF:', pdfError);
        await logToSupabase({ original_lead_id: specificLeadIdToTest || lead?.normalized_lead_id || 'N/A', property_address: lead?.property_address || 'N/A', email_status: 'ERROR_SYSTEM', email_error_message: `Error generating PDF: ${pdfError instanceof Error ? pdfError.message : String(pdfError)}`, campaign_id: null });
        return NextResponse.json({ success: false, error: 'Failed to generate PDF.', lead_id: leadIdForApiResponse, details: pdfError instanceof Error ? pdfError.message : String(pdfError) }, { status: 500 });
      }
    }
    
    // 6. Load Inline Logo
    let logoBuffer: Buffer | undefined;
    let logoContentType: string | undefined;
    try {
        const logoPath = path.join(templateDir, 'assets', 'truesoulreportslogowtext.png'); // Adjust path as needed
        logoBuffer = await fs.readFile(logoPath);
        logoContentType = 'image/png'; // Or detect dynamically
    } catch (logoError) {
        console.warn('Could not load inline logo:', logoError);
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
  console.error('Error sending email via gmailService:', emailError);
  const errorMessage = emailError instanceof Error ? emailError.message : String(emailError);
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
    console.error('Overall error in test-email handler:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred.';
    // Avoid logging again if it was already logged by a specific step's catch block
    // This is a general fallback.
    if (!(error instanceof Error && (error.message.includes("fetching active sender") || error.message.includes("fetching lead")))) {
        await logToSupabase({ email_status: 'ERROR_UNHANDLED', email_error_message: errorMessage, market_region: marketRegionNormalizedName || 'unknown' });
    }
    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 });
  }
}
