// src/app/api/engine/test-email/workflow/prepareEmailContentAndAssets-helper.ts
import fs from 'fs/promises';
import path from 'path';
import { Environment as NunjucksEnvironment } from 'nunjucks';
import { FineCutLead } from '@/types/supabase';
import { logSystemEvent } from '@/services/logService';
import { generateOfferDetails } from '@/actions/offerCalculations';
import type { SenderData, EmailAssets } from './_types'; // Adjusted path
import { extractSubjectAndCleanHtml } from '../_utils'; // Adjusted path

export async function prepareEmailContentAndAssets(
  lead: FineCutLead,
  sender: SenderData,
  nunjucksEnvInstance: NunjucksEnvironment,
  baseTemplateDir: string,
  campaignId?: string
): Promise<EmailAssets> {
  if (lead.assessed_total === null || typeof lead.assessed_total === 'undefined' || lead.assessed_total <= 0) {
    await logSystemEvent({ event_type: 'ENGINE_ASSET_PREP_ERROR', message: 'Invalid assessed_total for offer generation.', details: { lead_id: lead.id, assessed_total: lead.assessed_total }, campaign_id: campaignId, original_lead_id: String(lead.id) });
    throw new Error('Cannot generate offer details: assessed_total is invalid or missing.');
  }
  if (!lead.contact_name || typeof lead.contact_name !== 'string' || lead.contact_name.trim() === '') {
    await logSystemEvent({ event_type: 'ENGINE_ASSET_PREP_ERROR', message: 'Invalid contact_name for offer generation.', details: { lead_id: lead.id, contact_name: lead.contact_name }, campaign_id: campaignId, original_lead_id: String(lead.id) });
    throw new Error('Cannot generate offer details: contact_name is invalid or missing.');
  }

  const offerDetails = generateOfferDetails(lead.assessed_total, lead.contact_name as string);
  const staticTemplateFields = { inspection_period: "7 days (excluding weekends and federal holidays)", sender_title: "Acquisitions Specialist", company_name: "True Soul Partners LLC", current_year: new Date().getFullYear(), logo_cid: 'company_logo_cid' };
  const templateContext: Record<string, any> = { ...lead, ...offerDetails, sender_name: sender.sender_name, sender_email: sender.sender_email, ...staticTemplateFields, property_address: String(lead.property_address ?? ''), property_city: String(lead.property_city ?? ''), property_state: String(lead.property_state ?? ''), property_postal_code: String(lead.property_postal_code ?? ''), contact_name: String(lead.contact_name ?? '') };

  let rawHtmlBodyWithSubject: string;
  try {
    rawHtmlBodyWithSubject = nunjucksEnvInstance.render('email_body_with_subject.html', templateContext);
  } catch (renderError: any) {
    await logSystemEvent({ event_type: 'ENGINE_TEMPLATE_ERROR', message: `Error rendering HTML template (email_body_with_subject.html): ${renderError.message}`, details: { error: renderError, lead_id: lead.id, template_context_keys: Object.keys(templateContext) }, campaign_id: campaignId, original_lead_id: String(lead.id) });
    throw new Error(`HTML template rendering failed: ${renderError.message}`);
  }
  
  const { subject, cleanHtmlBody: htmlBody } = extractSubjectAndCleanHtml(rawHtmlBodyWithSubject, templateContext, nunjucksEnvInstance); // Using imported util

  let textBody: string;
  try {
    textBody = nunjucksEnvInstance.render('letter_of_intent_text.html', templateContext);
  } catch (renderError: any) {
    console.warn(`Nunjucks render error for text template (letter_of_intent_text.html): ${renderError.message}. Using fallback text body.`);
    await logSystemEvent({ event_type: 'ENGINE_TEMPLATE_WARNING', message: `Error rendering text template (letter_of_intent_text.html), using fallback: ${renderError.message}`, details: { error: renderError, lead_id: lead.id }, campaign_id: campaignId, original_lead_id: String(lead.id) });
    textBody = `Please enable HTML to view this email. Offer details for ${templateContext.property_address}.`;
  }

  let logoBuffer: Buffer | undefined;
  let logoContentType: string | undefined;
  try {
    const logoPath = path.join(baseTemplateDir, 'logo.png');
    logoBuffer = await fs.readFile(logoPath);
    logoContentType = 'image/png';
  } catch (logoError: any) {
    console.warn(`Could not load inline logo (logo.png): ${logoError.message}. Proceeding without logo.`);
    await logSystemEvent({ event_type: 'ENGINE_ASSET_WARNING', message: `Could not load inline logo (logo.png): ${logoError.message}. Proceeding without logo.`, details: { error: logoError, template_dir: baseTemplateDir }, campaign_id: campaignId, original_lead_id: String(lead.id) });
  }
  
  await logSystemEvent({ event_type: 'ENGINE_ASSET_PREP_SUCCESS', message: 'Email content and assets prepared successfully.', details: { lead_id: lead.id, subject: subject, has_logo: !!logoBuffer }, campaign_id: campaignId, original_lead_id: String(lead.id) });
  return { subject, htmlBody, textBody, templateContext, logoBuffer, logoContentType };
}
