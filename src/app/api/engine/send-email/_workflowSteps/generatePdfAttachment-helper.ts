// src/app/api/engine/test-email/workflow/generatePdfAttachment-helper.ts
import { generateLoiPdf, PersonalizationData } from '@/services';
import { logSystemEvent } from '@/services/logService';
import { FineCutLead } from '@/types/leads';

export async function generatePdfAttachment(
  sendPdf: boolean,
  templateContext: Record<string, unknown>,
  lead: FineCutLead,
  specificLeadIdToTest?: string | number,
  campaignId?: string
): Promise<Buffer | null> {
  if (!sendPdf) {
    await logSystemEvent({ event_type: 'ENGINE_PDF_GENERATION_SKIPPED', message: 'PDF generation was skipped as per request (sendPdf is false).', details: { lead_id: lead.id }, campaign_id: campaignId });
    return null;
  }
  await logSystemEvent({ event_type: 'ENGINE_PDF_GENERATION_ATTEMPT', message: 'Attempting to generate PDF attachment.', details: { lead_id: lead.id }, campaign_id: campaignId });
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
    await logSystemEvent({ event_type: 'ENGINE_PDF_GENERATION_SUCCESS', message: 'PDF attachment generated successfully.', details: { lead_id: lead.id, pdf_size_bytes: pdfBuffer?.length }, campaign_id: campaignId });
    return pdfBuffer;
  } catch (pdfError: unknown) {
    console.error('Error generating PDF:', pdfError);
    await logSystemEvent({ event_type: 'ENGINE_PDF_GENERATION_ERROR', message: `Failed to generate PDF: ${pdfError}`, details: { error: pdfError, lead_id: lead.id, personalization_keys: Object.keys(personalizationData) }, campaign_id: campaignId });
    throw new Error(`Failed to generate PDF attachment: ${pdfError}`);
  }
}
