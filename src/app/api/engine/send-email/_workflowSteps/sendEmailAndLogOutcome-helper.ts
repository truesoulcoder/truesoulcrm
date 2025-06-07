// src/app/api/engine/send-email/workflow/sendEmailAndLogOutcome-helper.ts
import { isValidEmail as validateEmailFromUtils } from '@/app/api/engine/_utils/_utils';
import { logToSupabaseTable } from '@/app/api/engine/send-email/_workflowSteps/_utils'; // Adjusted path
import { sendEmail as sendGmailService } from '@/services';
import { logSystemEvent } from '@/services/logService';


import type { EngineLogEntry, EmailDispatchFullParams } from './_types'; // Adjusted path


export async function sendEmailAndLogOutcome(
  params: EmailDispatchFullParams
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const { supabase, sender, lead, emailAssets, pdfBuffer, sendToLead, testRecipientEmail, testRecipientName, campaignId, marketRegionNormalizedName } = params;
  
  let recipientEmail: string;
  let recipientName: string;

  if (sendToLead && lead.contact_email && validateEmailFromUtils(lead.contact_email)) {
    recipientEmail = lead.contact_email;
    recipientName = lead.contact_name ?? "";
  } else {
    recipientEmail = testRecipientEmail;
    recipientName = testRecipientName;
    if (!sendToLead) console.log(`sendToLead is false. Using test recipient: ${recipientEmail}`);
    else console.log(`Lead contact_email (${lead.contact_email}) is invalid or missing. Using test recipient: ${recipientEmail}`);
  }

  try {
    await logSystemEvent({ event_type: 'ENGINE_EMAIL_SEND_ATTEMPT', message: `Attempting to send email to ${recipientEmail} from ${sender.sender_email} for lead ${lead.id}.`, details: { lead_id: lead.id, recipient: recipientEmail, sender: sender.sender_email, subject: emailAssets.subject, marketRegion: marketRegionNormalizedName }, campaign_id: campaignId });
    // Prepare attachments for sendGmailService
    const attachmentsForGmailService: {
      filename: string;
      content: Buffer;
      contentType?: string;
      contentId?: string;
    }[] = [];

    if (pdfBuffer) {
      attachmentsForGmailService.push({
        filename: `LOI_${String(lead.property_address)?.replace(/\s+/g, '_') || 'property'}.pdf`,
        content: pdfBuffer,
        contentType: 'application/pdf',
      });
    }

    if (emailAssets.logoBuffer && emailAssets.logoContentType && emailAssets.templateContext.logo_cid) {
      attachmentsForGmailService.push({
        filename: 'logo_inline', // A generic filename is fine for inline content
        content: emailAssets.logoBuffer,
        contentType: emailAssets.logoContentType,
        contentId: String(emailAssets.templateContext.logo_cid),
      });
    }

    // Corrected call to sendGmailService
    const emailResult = await sendGmailService(
      sender.sender_email,    // impersonatedUserEmail (From whom the email is sent via API)
      recipientEmail,         // recipientEmail (To whom the email is addressed)
      emailAssets.subject,    // subject
      emailAssets.htmlBody,   // htmlBody
      attachmentsForGmailService.length > 0 ? attachmentsForGmailService : undefined // attachments (optional array)
    );
    
    const logDetails: Partial<EngineLogEntry> = {
        contact_name: recipientName,
        contact_email: recipientEmail,
        property_address: lead.property_address,
        property_city: lead.property_city,
        property_state: lead.property_state,
        property_postal_code: lead.property_postal_code,
        market_region: marketRegionNormalizedName,
        sender_name: sender.sender_name,
        sender_email_used: sender.sender_email,
        email_subject_sent: emailAssets.subject,
        email_sent_at: new Date().toISOString(),
        campaign_id: campaignId,
    };

    // Debug log to check if lead fields are present
    console.log('DEBUG - Lead fields for logging:', {
      property_city: lead.property_city,
      property_state: lead.property_state,
      property_postal_code: lead.property_postal_code,
      assessed_total: lead.assessed_total
    });

    if (emailResult.success) {
      const statusToLog = sendToLead ? 'SENT' : 'SENT_TEST'; 
      await logToSupabaseTable(supabase, { 
        ...logDetails, 
        email_status: statusToLog,
      }, lead.id, campaignId);
      await logSystemEvent({ event_type: 'ENGINE_EMAIL_SEND_SUCCESS', message: `Email sent successfully to ${recipientEmail} for lead ${lead.id}. Message ID: ${emailResult.messageId}`, details: { lead_id: lead.id, message_id: emailResult.messageId, recipient: recipientEmail, marketRegion: marketRegionNormalizedName, original_lead_id: String(lead.id) }, campaign_id: campaignId });
      return { success: true, messageId: emailResult.messageId };
    } else {
      await logToSupabaseTable(supabase, { 
        ...logDetails, 
        email_status: 'FAILED_SENDING', 
        email_error_message: (emailResult.error as Error)?.message || "Unknown Gmail service error"
      }, lead.id, campaignId);
      return { success: false, error: (emailResult.error as Error)?.message || "Unknown error from sendGmailService" };
    }
  } catch (emailError: unknown) {
    console.error(`Error sending email for lead ${lead.id}:`, emailError instanceof Error ? emailError.message : "Unknown error");
     await logToSupabaseTable( // Using imported util
        supabase,
        { 
            contact_name: recipientName, 
            contact_email: recipientEmail, 
            property_address: lead.property_address,
            property_city: lead.property_city,
            property_state: lead.property_state,
            property_postal_code: lead.property_postal_code,
            assessed_total: lead.assessed_total,  
            market_region: marketRegionNormalizedName,
            sender_name: sender.sender_name,
            sender_email_used: sender.sender_email,
            email_subject_sent: emailAssets.subject,
            email_status: 'FAILED_SENDING', 
            email_error_message: emailError instanceof Error ? emailError.message : "Unknown error",
            email_sent_at: new Date().toISOString(),
            campaign_id: campaignId,
        }, 
        lead.id, 
        campaignId
    );
    await logSystemEvent({ event_type: 'ENGINE_EMAIL_SEND_ERROR', message: `Failed to send email to ${recipientEmail} for lead ${lead.id}: ${emailError instanceof Error ? emailError.message : "Unknown error"}`, details: { lead_id: lead.id, error: emailError, recipient: recipientEmail, marketRegion: marketRegionNormalizedName }, campaign_id: campaignId });
    return { success: false, error: emailError instanceof Error ? emailError.message : "Unknown error" };
  }
}
