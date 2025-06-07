// --- Drop-in Replacement for your Service File ---

// Define a more descriptive return type
interface GmailSendResult {
  success: boolean;
  internalId?: string;       // The short ID, e.g., '1973e2ad2ea3f111'
  globalMessageId?: string;  // The correct, long ID, e.g., '<...-GMR@mx.google.com>'
  threadId?: string;
  error?: unknown;
}

/**
 * Send an email using Gmail API and retrieves the globally unique Message-ID.
 * @param impersonatedUserEmail - Email address to send as
 * @param recipientEmail - Email address of the recipient
 * @param subject - Email subject
 * @param htmlBody - HTML content of the email
 * @param attachments - Optional array of file attachments
 * @returns Object containing success status and the correct globalMessageId
 */
async function sendEmail(
  impersonatedUserEmail: string,
  recipientEmail: string,
  subject: string,
  htmlBody: string,
  attachments?: { filename: string; content: Buffer; contentType?: string; contentId?: string }[]
): Promise<GmailSendResult> {
  try {
    // Get the Gmail service for the impersonated user
    // NOTE: Ensure this helper correctly initializes and returns the gmail client
    const gmail = getGmailService(impersonatedUserEmail);

    // Create a MIME message
    // Using multipart/related is better for mixed inline (logo) and regular attachments
    const boundary = `----=_Part_Boundary_${Math.random().toString(36).substring(2)}`;
    const message = [
      `From: <${impersonatedUserEmail}>`,
      `To: <${recipientEmail}>`,
      `Subject: ${subject}`,
      `MIME-Version: 1.0`,
      `Content-Type: multipart/related; boundary="${boundary}"`,
      ``,
      `--${boundary}`,
      `Content-Type: text/html; charset="utf-8"`,
      `Content-Transfer-Encoding: 7bit`,
      ``,
      htmlBody,
      ``,
    ];

    if (attachments && attachments.length > 0) {
      for (const file of attachments) {
        message.push(`--${boundary}`);
        message.push(`Content-Type: ${file.contentType || 'application/octet-stream'}`);
        message.push(`Content-Transfer-Encoding: base64`);
        if (file.contentId) {
          message.push(`Content-ID: <${file.contentId}>`);
          message.push(`Content-Disposition: inline; filename="${file.filename}"`);
        } else {
          message.push(`Content-Disposition: attachment; filename="${file.filename}"`);
        }
        message.push(``);
        message.push(file.content.toString('base64'));
      }
    }
    message.push(`--${boundary}--`);

    const rawMessage = Buffer.from(message.join('\r\n')).toString('base64url');

    // --- STEP 1: Send the email ---
    const sendResponse = await gmail.users.messages.send({
      userId: impersonatedUserEmail,
      requestBody: { raw: rawMessage },
    });

    const internalId = sendResponse.data.id;
    const threadId = sendResponse.data.threadId;

    if (!internalId) {
      throw new Error('Gmail send API call succeeded but returned no message ID.');
    }

    // --- STEP 2: CRITICAL FIX - GET THE MESSAGE METADATA ---
    // Use the internalId to fetch the metadata of the sent message
    const getResponse = await gmail.users.messages.get({
      userId: impersonatedUserEmail,
      id: internalId,
      format: 'metadata',
      metadataHeaders: ['Message-ID'], // Efficiently fetch only the header we need
    });

    // Find and extract the correct, globally-unique Message-ID
    const messageIdHeader = getResponse.data.payload?.headers?.find(
      (h) => h.name?.toLowerCase() === 'message-id'
    );

    if (!messageIdHeader?.value) {
      throw new Error(`Could not find Message-ID header for sent email. Internal ID: ${internalId}`);
    }

    const globalMessageId = messageIdHeader.value;

    console.log(`Successfully sent email. Internal ID: ${internalId}, Global Message-ID: ${globalMessageId}`);

    return {
      success: true,
      internalId,
      threadId: threadId || undefined,
      globalMessageId, // This is the correct ID for tracking
    };

  } catch (error) {
    console.error('sendEmail service critical error:', error);
    return { success: false, error };
  }
}