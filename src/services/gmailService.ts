import { JWT } from 'google-auth-library';
import { google } from 'googleapis';
import { getGmailService } from '@/app/api/engine/_utils/_utils';

/**
 * Gmail service for sending emails through Google's Gmail API
 * Uses service account with domain-wide delegation to send emails
 */

export { sendEmail, initializeGmailService };

// Service-wide variables
let authClient: JWT;
let gmail: ReturnType<typeof google.gmail>;

/**
 * Initialize the Gmail service with the provided service account key
 * @param googleServiceAccountKeyJson - JSON string containing the service account credentials
 * @returns The initialized Gmail API client
 */
function initializeGmailService(googleServiceAccountKeyJson: string): ReturnType<typeof google.gmail> {
  if (!googleServiceAccountKeyJson) {
    throw new Error(
      'Google Service Account Key is not provided. ' +
      'This is required for Gmail integration.'
    );
  }

  let serviceKey;
  try {
    serviceKey = JSON.parse(googleServiceAccountKeyJson);
  } catch (e) {
    console.error('Failed to parse Google Service Account Key:', e);
    throw new Error(
      'Google Service Account Key is not valid JSON. ' +
      'Please ensure it is a correctly formatted JSON string.'
    );
  }

  authClient = new google.auth.JWT({
    email: serviceKey.client_email,
    key: serviceKey.private_key,
    scopes: ['https://www.googleapis.com/auth/gmail.send'],
  });

  gmail = google.gmail({ version: 'v1', auth: authClient });
  return gmail;
}

/**
 * Send an email using Gmail API with domain-wide delegation
 * @param impersonatedUserEmail - Email address to send as (must be authorized for delegation)
 * @param recipientEmail - Email address of the recipient
 * @param subject - Email subject
 * @param htmlBody - HTML content of the email
 * @param attachments - Optional array of file attachments
 * @returns Object containing success status and message details or error
 */
async function sendEmail(
  impersonatedUserEmail: string,
  recipientEmail: string,
  subject: string,
  htmlBody: string,
  attachments?: { filename: string; content: Buffer; contentType?: string; contentId?: string }[]
): Promise<{ success: boolean; messageId?: string; threadId?: string; error?: unknown }> {
  try {
    // Get the Gmail service for the impersonated user
    const gmail = getGmailService(impersonatedUserEmail);
    
    // Create a simple MIME message with proper boundaries
    const boundary = `----=_Part_Boundary_${Math.random().toString(36).substring(2)}`;
    
    let message = [];
    message.push(`From: ${impersonatedUserEmail}`);
    message.push(`To: ${recipientEmail}`);
    message.push(`Subject: ${subject}`);
    message.push(`MIME-Version: 1.0`);
    message.push(`Content-Type: multipart/mixed; boundary="${boundary}"`);
    message.push(``);
    
    // HTML part
    message.push(`--${boundary}`);
    message.push(`Content-Type: text/html; charset="utf-8"`);
    message.push(`Content-Transfer-Encoding: 7bit`);
    message.push(``);
    message.push(htmlBody);
    message.push(``);
    
    // Attachments
    if (attachments && attachments.length > 0) {
      for (const file of attachments) {
        message.push(`--${boundary}`);
        message.push(`Content-Type: ${file.contentType || 'application/octet-stream'}; name="${file.filename}"`);
        message.push(`Content-Transfer-Encoding: base64`);
        
        if (file.contentId) {
          message.push(`Content-ID: <${file.contentId}>`);
          message.push(`Content-Disposition: inline; filename="${file.filename}"`);
        } else {
          message.push(`Content-Disposition: attachment; filename="${file.filename}"`);
        }
        
        message.push(``);
        // Base64 encode the content without splitting into lines
        message.push(file.content.toString('base64'));
      }
    }
    
    message.push(`--${boundary}--`);
    
    // Create the raw message string
    const rawMessageString = message.join('\r\n');
    
    // Use base64url encoding directly
    const rawMessage = Buffer.from(rawMessageString).toString('base64url');
    
    // Send the email
    const res = await gmail.users.messages.send({
      userId: impersonatedUserEmail,
      requestBody: { raw: rawMessage },
    });
    
    return { success: true, messageId: res.data.id!, threadId: res.data.threadId! };
  } catch (error) {
    console.error('sendEmail error:', error);
    return { success: false, error };
  }
}