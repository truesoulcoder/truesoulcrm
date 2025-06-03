import type { NextApiRequest, NextApiResponse } from 'next';
import fs from 'fs/promises';
import path from 'path';
import nunjucks from 'nunjucks';
import {
  getSupabaseClient,
  getGmailService,
  isValidEmail,
} from './_utils'; // Assuming logToSupabase is not directly used now
import { generateLoiPdf } from './_pdfUtils';
import { SupabaseClient } from '@supabase/supabase-js';

// Define a type for the log entry for cleaner code, matching eli5_email_log structure
interface Eli5EmailLogEntry {
  id?: number; 
  original_lead_id?: string;
  contact_name?: string;
  contact_email?: string;
  sender_name?: string;
  sender_email_used?: string;
  email_subject_sent?: string;
  email_body_preview_sent?: string;
  email_status?: string; 
  email_error_message?: string | null;
  email_sent_at?: string | null; 
  campaign_id?: string;
  campaign_run_id?: string;
  created_at?: string; 
  is_converted_status_updated_by_webhook?: boolean | null;
  [key: string]: any; 
}

const templateDir = path.join(process.cwd(), 'pages', 'api', 'eli5-engine', 'templates');
nunjucks.configure(templateDir, { autoescape: true });

// Sender management
let senders: Array<{id: string, name: string, email: string, daily_limit: number, sent_today: number}> = [];
let currentSenderIndex = 0;

// Function to fetch and update senders from the database
async function updateSendersFromDB(supabase: SupabaseClient) {
  try {
    const { data, error } = await supabase
      .from('senders')
      .select('id, name, email, daily_limit, sent_today')
      .eq('is_active', true)
      .order('sent_today', { ascending: true });

    if (error) {
      console.error('Error fetching senders:', error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error('Exception when fetching senders:', error);
    return [];
  }
}

// Function to get the next available sender
async function getNextSender(supabase: SupabaseClient) {
  // Refresh senders from DB to get latest counts
  senders = await updateSendersFromDB(supabase);
  
  if (senders.length === 0) {
    throw new Error('No active senders found in the database');
  }

  // Find a sender that hasn't exceeded their daily limit
  for (let i = 0; i < senders.length; i++) {
    const sender = senders[currentSenderIndex % senders.length];
    currentSenderIndex++;
    
    if (sender.sent_today < sender.daily_limit) {
      return sender;
    }
  }

  // If all senders have hit their daily limit, return the one with the least sends
  senders.sort((a, b) => (a.sent_today || 0) - (b.sent_today || 0));
  return senders[0];
}

// Function to increment the sent count for a sender
async function incrementSenderSentCount(supabase: SupabaseClient, senderId: string) {
  try {
    const { error } = await supabase.rpc('increment_sender_sent_count', {
      sender_id: senderId
    });

    if (error) {
      console.error('Error incrementing sender sent count:', error);
    }
  } catch (error) {
    console.error('Exception when incrementing sender sent count:', error);
  }
}

async function logInitialAttempt(
  supabase: SupabaseClient,
  logData: Partial<Eli5EmailLogEntry>
): Promise<number | null> {
  try {
    const { data, error } = await supabase
      .from('eli5_email_log')
      .insert({ ...logData, email_status: logData.email_status || 'PENDING_PROCESSING' }) // Default if not provided
      .select('id')
      .single();

    if (error) {
      console.error('Failed to log initial attempt to Supabase:', error);
      throw error; 
    }
    if (!data || !data.id) {
        console.error('Failed to log initial attempt to Supabase: No ID returned');
        throw new Error('Failed to log initial attempt: No ID returned');
    }
    return data.id;
  } catch (error) {
    console.error('Error in logInitialAttempt:', error);
    throw error;
  }
}

async function updateEmailLogStatus(
  supabase: SupabaseClient,
  logId: number,
  status: string,
  sentAt: string | null = null,
  errorMessage: string | null = null,
  isConvertedStatus: boolean | null = null
): Promise<void> {
  const updateData: Partial<Eli5EmailLogEntry> = {
    email_status: status,
    email_sent_at: sentAt,
    email_error_message: errorMessage,
  };
  if (isConvertedStatus !== null) {
    updateData.is_converted_status_updated_by_webhook = isConvertedStatus;
  }

  try {
    const { error } = await supabase
      .from('eli5_email_log')
      .update(updateData)
      .eq('id', logId);

    if (error) {
      console.error(`Failed to update email log status for log ID ${logId}:`, error);
    }
  } catch (error) {
    console.error(`Error in updateEmailLogStatus for log ID ${logId}:`, error);
  }
}

interface StartCampaignRequestBody {
  market_region: string;
  limit_per_run?: number;
  campaign_id?: string; 
  campaign_run_id?: string; 
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  const {
    market_region,
    limit_per_run = 10, // Default limit
    campaign_id = `campaign-${Date.now()}`, 
    campaign_run_id = `run-${Date.now()}` 
  }: StartCampaignRequestBody = req.body;

  if (!market_region || typeof market_region !== 'string') {
    return res.status(400).json({ success: false, error: 'market_region (string) is required.' });
  }
  if (typeof limit_per_run !== 'number' || limit_per_run <= 0) {
    return res.status(400).json({ success: false, error: 'limit_per_run (positive number) is invalid.' });
  }

  const supabase = getSupabaseClient();
  let attemptedCount = 0;
  let successCount = 0;
  let failureCount = 0;
  const processingErrors: { lead_id: string, error: string }[] = [];

  try {
    const { data: leads, error: leadsError } = await supabase
      .from('useful_leads')
      .select('*')
      .eq('market_region', market_region)
      .is('email_sent', null) 
      .neq('property_type', 'Vacant Land')
      .not('contact_email', 'is', null)
      .order('id', { ascending: true })
      .limit(limit_per_run);

    if (leadsError) {
      throw new Error(`Failed to fetch leads: ${leadsError.message}`);
    }

    if (!leads || leads.length === 0) {
      return res.status(200).json({
        success: true, message: 'No eligible leads found for the given criteria.',
        market_region, campaign_id, campaign_run_id, attempted: 0, succeeded: 0, failed: 0, processing_errors: []
      });
    }

    for (const lead of leads) {
      attemptedCount++;
      let logId: number | null = null;

      try {
        if (!lead.contact_email || !isValidEmail(lead.contact_email)) {
          const errMsg = `Invalid or missing contact email: ${lead.contact_email || 'N/A'}`;
          processingErrors.push({ lead_id: lead.id, error: errMsg });
          failureCount++;
          // Try to log this validation failure without it stopping the whole process
          try {
            await logInitialAttempt(supabase, {
              original_lead_id: lead.id, contact_name: lead.contact_name || 'N/A',
              contact_email: lead.contact_email || 'N/A', sender_email_used: 'sender@example.com',
              sender_name: 'Sender Name', campaign_id: campaign_id, campaign_run_id: campaign_run_id,
              email_status: 'VALIDATION_FAILED', email_error_message: errMsg,
            });
          } catch (logErr: any) { console.error(`Lead ID ${lead.id}: Failed to log validation failure: ${logErr.message}`); }
          continue;
        }

        // Get the next available sender
        const sender = await getNextSender(supabase);
        if (!sender) {
          throw new Error('No available senders');
        }

        logId = await logInitialAttempt(supabase, {
          original_lead_id: lead.id, 
          contact_name: lead.contact_name || 'N/A',
          contact_email: lead.contact_email, 
          sender_email_used: sender.email,
          sender_name: sender.name, 
          campaign_id: campaign_id, 
          campaign_run_id: campaign_run_id,
        });

        if (!logId) throw new Error("Failed to create initial log entry."); // Should be caught by outer lead try-catch

        const emailTemplatePath = path.join(templateDir, 'email_body_with_subject.html');
        const emailHtmlContent = await fs.readFile(emailTemplatePath, 'utf-8');
        const subjectMatch = emailHtmlContent.match(/<!-- SUBJECT: (.*?) -->/);
        const rawSubjectTemplate = subjectMatch ? subjectMatch[1].trim() : 'Following Up on Your Property';
        const rawBodyTemplate = emailHtmlContent.replace(/<!-- SUBJECT: (.*?) -->/, '').trim();

        const templateData = { 
          ...lead, 
          contact_name: lead.contact_name || 'Valued Contact', 
          sender_name: sender.name, 
          sender_email: sender.email 
        };
        const emailSubject = nunjucks.renderString(rawSubjectTemplate, templateData);
        const emailBodyHtml = nunjucks.renderString(rawBodyTemplate, templateData);

        await supabase.from('eli5_email_log').update({
            email_subject_sent: emailSubject, email_body_preview_sent: emailBodyHtml.substring(0, 255)
        }).eq('id', logId);
        
        const pdfPersonalizationData = { ...templateData, date_generated: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) };
        const pdfBuffer = await generateLoiPdf(pdfPersonalizationData, lead.id, lead.contact_email);

        if (!pdfBuffer) {
          await updateEmailLogStatus(supabase, logId, 'PDF_GENERATION_FAILED', null, 'generateLoiPdf returned null.');
          failureCount++; processingErrors.push({ lead_id: lead.id, error: 'PDF generation failed.' });
          continue; 
        }

        const createMimeMessage = (to: string, from: string, fromName: string, subject: string, htmlBody: string, pdfAtt: { filename: string; content: Buffer }): string => {
            const boundary = `----=_Part_Boundary_${Math.random().toString(36).substring(2)}`;
            let email = `From: "${fromName}" <${from}>\r\nTo: ${to}\r\nSubject: ${subject}\r\n`;
            email += `MIME-Version: 1.0\r\nContent-Type: multipart/mixed; boundary="${boundary}"\r\n\r\n`;
            email += `--${boundary}\r\nContent-Type: text/html; charset="utf-8"\r\n\r\n${htmlBody}\r\n\r\n`;
            email += `--${boundary}\r\nContent-Type: application/pdf; name="${pdfAtt.filename}"\r\nContent-Disposition: attachment; filename="${pdfAtt.filename}"\r\nContent-Transfer-Encoding: base64\r\n\r\n${pdfAtt.content.toString('base64')}\r\n\r\n--${boundary}--`;
            return email;
        };
        
        const rawEmail = createMimeMessage(
          lead.contact_email,
          sender.email,
          sender.name,
          emailSubject,
          emailBodyHtml,
          { filename: `Letter_of_Intent_${lead.property_address?.replace(/\s+/g, '_') || lead.id}.pdf`, content: pdfBuffer }
        );
        const base64EncodedEmail = Buffer.from(rawEmail).toString('base64');

        // Increment the sender's sent count before sending
        await incrementSenderSentCount(supabase, sender.id);
        
        try {
          const gmail = getGmailService(sender.email);
          await gmail.users.messages.send({ userId: 'me', requestBody: { raw: base64EncodedEmail } });
          
          const sentAt = new Date().toISOString();
          await updateEmailLogStatus(supabase, logId, 'SENT', sentAt);
          await supabase.from('useful_leads').update({ email_sent: true, email_sent_at: sentAt }).eq('id', lead.id);
          successCount++;
        } catch (emailError: any) {
          await updateEmailLogStatus(supabase, logId, 'SEND_FAILED', null, emailError.message);
          failureCount++; processingErrors.push({ lead_id: lead.id, error: `Email send failed: ${emailError.message}` });
        }

      } catch (leadProcessingError: any) {
        console.error(`Error processing lead ID ${lead.id}:`, leadProcessingError.message, leadProcessingError.stack);
        failureCount++;
        processingErrors.push({ lead_id: lead.id, error: leadProcessingError.message });
        if (logId) {
          await updateEmailLogStatus(supabase, logId, 'PROCESSING_FAILED', null, leadProcessingError.message);
        } else {
          try { // Attempt to log if initial logId wasn't even created
            await logInitialAttempt(supabase, {
              original_lead_id: lead.id, contact_name: lead.contact_name || 'N/A',
              contact_email: lead.contact_email || 'N/A', sender_email_used: 'system@example.com',
              sender_name: 'System', campaign_id: campaign_id, campaign_run_id: campaign_run_id,
              email_status: 'PROCESSING_FAILED', email_error_message: leadProcessingError.message,
            });
          } catch (logErr: any) { console.error(`Lead ID ${lead.id}: Critical - Failed to log processing failure: ${logErr.message}`); }
        }
      }
    } // End of for...of loop

    return res.status(200).json({
      success: true, message: `Campaign batch processing finished for ${market_region}.`,
      market_region, limit_per_run, campaign_id, campaign_run_id,
      attempted: attemptedCount, succeeded: successCount, failed: failureCount,
      processing_errors: processingErrors,
    });

  } catch (error: any) { // Catch-all for errors outside the loop (e.g., initial DB query failure)
    console.error('Major error in start-campaign handler:', error.message, error.stack);
    return res.status(500).json({
      success: false, error: `Major error: ${error.message}`, market_region, campaign_id, campaign_run_id,
      attempted: attemptedCount, succeeded: successCount, failed: failureCount,
      processing_errors: [...processingErrors, {lead_id: 'N/A', error: `Major handler error: ${error.message}`}],
    });
  }
}
