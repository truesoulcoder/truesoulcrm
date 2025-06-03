import { google } from 'googleapis';

export { sendEmail };

// Initialize JWT auth with service account key
const googleServiceAccountKeyJson = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;

if (!googleServiceAccountKeyJson) {
  throw new Error(
    'GOOGLE_SERVICE_ACCOUNT_KEY environment variable is not defined. ' +
    'This is required for Gmail integration. Please ensure it is set in your build environment.'
  );
}

let serviceKey;
try {
  serviceKey = JSON.parse(googleServiceAccountKeyJson);
} catch (e) {
  console.error('Failed to parse GOOGLE_SERVICE_ACCOUNT_KEY:', e);
  throw new Error(
    'GOOGLE_SERVICE_ACCOUNT_KEY is not valid JSON. ' +
    'Please ensure it is a correctly formatted JSON string.'
  );
}

const authClient = new google.auth.JWT({
  email: serviceKey.client_email,
  key: serviceKey.private_key,
  scopes: ['https://www.googleapis.com/auth/gmail.send'],
});

const gmail = google.gmail({ version: 'v1', auth: authClient });

async function sendEmail(
  impersonatedUserEmail: string,
  recipientEmail: string,
  subject: string,
  htmlBody: string,
  attachments?: { filename: string; content: Buffer }[]
): Promise<{ success: boolean; messageId?: string; threadId?: string; error?: unknown }> {
  try {
    authClient.subject = impersonatedUserEmail;

    const boundary = `boundary_${Date.now()}`;
    const message = [] as string[];
    message.push(`From: ${impersonatedUserEmail}`);
    message.push(`To: ${recipientEmail}`);
    message.push(`Subject: ${subject}`);
    message.push('MIME-Version: 1.0');
    message.push(`Content-Type: multipart/mixed; boundary="${boundary}"`);
    message.push('');
    message.push(`--${boundary}`);
    message.push('Content-Type: text/html; charset="UTF-8"');
    message.push('Content-Transfer-Encoding: 7bit');
    message.push('');
    message.push(htmlBody);

    if (attachments && attachments.length) {
      for (const file of attachments) {
        message.push(`--${boundary}`);
        message.push(`Content-Type: application/octet-stream; name="${file.filename}"`);
        message.push('Content-Transfer-Encoding: base64');
        message.push(`Content-Disposition: attachment; filename="${file.filename}"`);
        message.push('');
        message.push(file.content.toString('base64'));
      }
    }
    message.push(`--${boundary}--`);

    const rawMessage = Buffer.from(message.join('\r\n'))
      .toString('base64')
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

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