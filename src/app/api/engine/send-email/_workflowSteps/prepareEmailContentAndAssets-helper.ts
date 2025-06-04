// src/app/api/engine/test-email/workflow/prepareEmailContentAndAssets-helper.ts
import fs from 'fs/promises';
import path from 'path';

import { Environment as NunjucksEnvironment } from 'nunjucks';

import { generateOfferDetails } from '@/actions/offerCalculations';
import { extractSubjectAndCleanHtml } from '@/app/api/engine/send-email/_workflowSteps/_utils';
import { logSystemEvent } from '@/services/logService';
import { FineCutLead } from '@/types/leads';


import type { SenderData, EmailAssets } from './_types';

/**
 * Prepares email content and assets for a given lead.
 * 
 * @param lead The lead to prepare email content and assets for.
 * @param sender The sender data.
 * @param nunjucksEnvInstance The Nunjucks environment instance.
 * @param baseTemplateDir The base template directory.
 * @param campaignId The campaign ID (optional).
 * @returns A promise resolving to the prepared email assets.
 */
export async function prepareEmailContentAndAssets(
  lead: FineCutLead,
  sender: SenderData,
  nunjucksEnvInstance: NunjucksEnvironment,
  baseTemplateDir: string,
  campaignId?: string
): Promise<EmailAssets> {
  if (lead.assessed_total === null || typeof lead.assessed_total === 'undefined' || lead.assessed_total <= 0) {
    await logSystemEvent({ event_type: 'ENGINE_ASSET_PREP_ERROR', message: 'Invalid assessed_total for offer generation.', details: { lead_id: lead.id, assessed_total: lead.assessed_total }, campaign_id: campaignId });
    throw new Error('Cannot generate offer details: assessed_total is invalid or missing.');
  }
  if (!lead.contact_name || typeof lead.contact_name !== 'string' || lead.contact_name.trim() === '') {
    await logSystemEvent({ event_type: 'ENGINE_ASSET_PREP_ERROR', message: 'Invalid contact_name for offer generation.', details: { lead_id: lead.id, contact_name: lead.contact_name }, campaign_id: campaignId });
    throw new Error('Cannot generate offer details: contact_name is invalid or missing.');
  }

  // Extract greeting name from contact name (first name or first part before any space)
  const contactNameStr = String(lead.contact_name).trim();
  const nameParts = contactNameStr.split(' ');
  const greetingName = nameParts[0] || contactNameStr;
  const lastName = nameParts.length > 1 ? nameParts[nameParts.length - 1] : '';

  const offerDetails = generateOfferDetails(lead.assessed_total, lead.contact_name as string);
  const staticTemplateFields = { inspection_period: "7 days (excluding weekends and federal holidays)", sender_title: "Acquisitions Director", company_name: "True Soul Partners LLC", current_year: new Date().getFullYear(), logo_cid: 'company_logo' };
  const templateContext: Record<string, unknown> = { 
    ...lead, 
    ...offerDetails, 
    sender_name: sender.sender_name, 
    sender_email: sender.sender_email, 
    ...staticTemplateFields, 
    property_address: String(lead.property_address ?? ''), 
    property_city: String(lead.property_city ?? ''), 
    property_state: String(lead.property_state ?? ''), 
    property_postal_code: String(lead.property_postal_code ?? ''), 
    contact_name: contactNameStr,
    greeting_name: greetingName,
    first_name: greetingName,
    last_name: lastName
  };

  let rawHtmlBodyWithSubject: string;
  try {
    rawHtmlBodyWithSubject = nunjucksEnvInstance.render('email_body_with_subject.html', templateContext);
  } catch (renderError: unknown) {
    const errorMessage = renderError instanceof Error ? renderError.message : String(renderError);
    await logSystemEvent({ event_type: 'ENGINE_TEMPLATE_ERROR', message: `Error rendering HTML template (email_body_with_subject.html): ${errorMessage}`, details: { error: renderError, lead_id: lead.id, template_context_keys: Object.keys(templateContext) }, campaign_id: campaignId });
    throw new Error(`HTML template rendering failed: ${errorMessage}`);
  }
  
  const { subject, cleanHtmlBody: htmlBody } = extractSubjectAndCleanHtml(rawHtmlBodyWithSubject, templateContext, nunjucksEnvInstance); // Using imported util

  let textBody: string;
  try {
    textBody = nunjucksEnvInstance.render('letter_of_intent_text.html', templateContext);
  } catch (renderError: unknown) {
    const errorMessage = renderError instanceof Error ? renderError.message : String(renderError);
    console.warn(`Nunjucks render error for text template (letter_of_intent_text.html): ${errorMessage}. Using fallback text body.`);
    await logSystemEvent({ event_type: 'ENGINE_TEMPLATE_WARNING', message: `Error rendering text template (letter_of_intent_text.html), using fallback: ${errorMessage}`, details: { error: renderError, lead_id: lead.id }, campaign_id: campaignId });
    textBody = `Please enable HTML to view this email. Offer details for ${templateContext.property_address}.`;
  }

  let logoBuffer: Buffer | undefined;
  let logoContentType: string | undefined;
  try {
    const logoPath = path.join(baseTemplateDir, 'logo.png');
    logoBuffer = await fs.readFile(logoPath);
    logoContentType = 'image/png';
  } catch (logoError: unknown) {
    const errorMessage = logoError instanceof Error ? logoError.message : String(logoError);
    console.warn(`Could not load inline logo (logo.png): ${errorMessage}. Proceeding without logo.`);
    await logSystemEvent({ event_type: 'ENGINE_ASSET_WARNING', message: `Could not load inline logo (logo.png): ${errorMessage}. Proceeding without logo.`, details: { error: logoError, template_dir: baseTemplateDir }, campaign_id: campaignId });
  }
  
  await logSystemEvent({ event_type: 'ENGINE_ASSET_PREP_SUCCESS', message: 'Email content and assets prepared successfully.', details: { lead_id: lead.id, subject, has_logo: !!logoBuffer }, campaign_id: campaignId });
  return { subject, htmlBody, textBody, templateContext, logoBuffer, logoContentType };
}
