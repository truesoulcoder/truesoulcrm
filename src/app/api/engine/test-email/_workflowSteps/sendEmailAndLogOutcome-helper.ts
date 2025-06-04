// src/app/api/engine/test-email/workflow/sendEmailAndLogOutcome-helper.ts
import { createAdminServerClient } from '@/utils/supabase-admin';
import { FineCutLead } from '@/types/supabase';
import { isValidEmail as validateEmailFromUtils } from '@/app/api/engine/_utils/_utils';
import { sendEmail as sendGmailService } from '@/services';
import { logSystemEvent } from '@/services/logService';
import type { SenderData, EmailAssets, EmailLogEntry, EmailDispatchFullParams } from './_types'; // Adjusted path
import { logToSupabaseTable } from '../_utils'; // Adjusted path

export async function sendEmailAndLogOutcome(
  params: EmailDispatchFullParams
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const { supabase, sender, lead, emailAssets, pdfBuffer, sendToLead, testRecipientEmail, testRecipientName, campaignId, marketRegionNormalizedName } = params;
  
  let recipientEmail: string;
  let recipientName: string;

  if (sendToLead && lead.contact_email && validateEmailFromUtils(lead.contact_email)) {
    recipientEmail = lead.contact_email;
    recipientName = lead.contact_name || 'Valued Homeowner';
  } else {
    recipientEmail = testRecipientEmail;
    recipientName = testRecipientName;
    if (!sendToLead) console.log(`sendToLead is false. Using test recipient: ${recipientEmail}`);
    else console.log(`Lead contact_email (${lead.contact_email}) is invalid or missing. Using test recipient: ${recipientEmail}`);
  }

  try {
    await logSystemEvent({ event_type: 'ENGINE_EMAIL_SEND_ATTEMPT', message: `Attempting to send email to ${recipientEmail} from ${sender.sender_email} for lead ${lead.id}.`, details: { lead_id: lead.id, recipient: recipientEmail, sender: sender.sender_email, subject: emailAssets.subject, marketRegion: marketRegionNormalizedName }, campaign_id: campaignId, original_lead_id: String(lead.id) });
    const emailResult = await sendGmailService( sender.sender_email, sender.sender_name, recipientEmail, emailAssets.subject, emailAssets.htmlBody, pdfBuffer ? { filename: `LOI_${String(lead.property_address)?.replace(/\s+/g, '_') || 'property'}.pdf`, content: pdfBuffer } : undefined, emailAssets.logoBuffer && emailAssets.logoContentType ? { contentId: emailAssets.templateContext.logo_cid, contentType: emailAssets.logoContentType, content: emailAssets.logoBuffer } : undefined );
    
    const logDetails: Partial<EmailLogEntry> = {
        original_lead_id: String(lead.id),
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
        campaign_id: campaignId || 'TEST_EMAIL_CAMPAIGN',
    };

    if (emailResult.success) {
      await logToSupabaseTable(supabase, { ...logDetails, email_status: 'SENT_TEST' }, lead.id, campaignId); // Using imported util
      await logSystemEvent({ event_type: 'ENGINE_EMAIL_SEND_SUCCESS', message: `Email sent successfully to ${recipientEmail} for lead ${lead.id}. Message ID: ${emailResult.messageId}`, details: { lead_id: lead.id, message_id: emailResult.messageId, recipient: recipientEmail, marketRegion: marketRegionNormalizedName }, campaign_id: campaignId, original_lead_id: String(lead.id) });
      return { success: true, messageId: emailResult.messageId };
    } else {
      await logToSupabaseTable(supabase, { ...logDetails, email_status: 'FAILED_SENDING', email_error_message: (emailResult.error as any)?.message || "Unknown Gmail service error" }, lead.id, campaignId); // Using imported util
      throw emailResult.error || new Error("Unknown error from sendGmailService");
    }
  } catch (emailError: any) {
    console.error(`Error sending email for lead ${lead.id}:`, emailError.message);
     await logToSupabaseTable( // Using imported util
        supabase,
        { 
            original_lead_id: String(lead.id),
            contact_name: recipientName, 
            contact_email: recipientEmail, 
            property_address: lead.property_address,
            market_region: marketRegionNormalizedName,
            sender_name: sender.sender_name,
            sender_email_used: sender.sender_email,
            email_subject_sent: emailAssets.subject,
            email_status: 'FAILED_SENDING', 
            email_error_message: emailError.message,
            email_sent_at: new Date().toISOString(),
            campaign_id: campaignId || 'TEST_EMAIL_CAMPAIGN',
        }, 
        lead.id, 
        campaignId
    );
    await logSystemEvent({ event_type: 'ENGINE_EMAIL_SEND_ERROR', message: `Failed to send email to ${recipientEmail} for lead ${lead.id}: ${emailError.message}`, details: { lead_id: lead.id, error: emailError, recipient: recipientEmail, marketRegion: marketRegionNormalizedName }, campaign_id: campaignId, original_lead_id: String(lead.id) });
    return { success: false, error: emailError.message };
  }
}
