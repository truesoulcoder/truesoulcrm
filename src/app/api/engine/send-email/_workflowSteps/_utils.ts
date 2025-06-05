// Shared utility functions for the test email workflow
import { Environment as NunjucksEnvironment } from 'nunjucks';

import { isValidEmail as validateEmailFromUtils } from '@/app/api/engine/_utils/_utils';
import { logSystemEvent } from '@/services/logService';
import { FineCutLead } from '@/types/leads';

import { EngineLogEntry } from './_types'; // Assuming _types.ts is in the same directory
import { SupabaseClient } from '@supabase/supabase-js'; // Import SupabaseClient type

export function extractSubjectAndCleanHtml(
  renderedHtmlWithComment: string,
  context: Record<string, unknown>,
  nunjucks: NunjucksEnvironment
): { subject: string; cleanHtmlBody: string } {
  const subjectRegex = /<!-- SUBJECT: (.*?) -->/s;
  const match = renderedHtmlWithComment.match(subjectRegex);
  let subject = `Offer for ${context.property_address || 'Your Property'}`;
  let cleanHtmlBody = renderedHtmlWithComment;

  if (match && match[1]) {
    try {
      subject = nunjucks.renderString(match[1].trim(), context);
    } catch (e: unknown) {
      console.error(`Error rendering subject template: "${match[1].trim()}"`, e);
      subject = match[1].trim() || subject;
    }
    cleanHtmlBody = renderedHtmlWithComment.replace(subjectRegex, '').trim();
  }
  return { subject, cleanHtmlBody };
}

export function validateLeadFields( // Renamed from _validateLeadFields
  lead: FineCutLead | null | undefined,
  leadIdForMsg: string | number
): { isValid: boolean; errorMessages: string[]; validatedLead: FineCutLead | null } {
  if (!lead) {
    return { isValid: false, errorMessages: ['Lead data is null or undefined.'], validatedLead: null };
  }
  const errors: string[] = [];
  const {
    contact_name,
    contact_email,
    property_address,
    property_city,
    property_state,
    property_postal_code,
    assessed_total,
  } = lead;

  if (!contact_name || typeof contact_name !== 'string' || contact_name.trim() === '') errors.push('contact_name is missing or invalid.');
  if (!contact_email || !validateEmailFromUtils(contact_email)) errors.push('contact_email is missing or invalid.');
  if (!property_address || typeof property_address !== 'string' || property_address.trim() === '') errors.push('property_address is missing or invalid.');
  if (!property_city || typeof property_city !== 'string' || property_city.trim() === '') errors.push('property_city is missing or invalid.');
  if (!property_state || typeof property_state !== 'string' || property_state.trim() === '') errors.push('property_state is missing or invalid.');
  if (!property_postal_code || typeof property_postal_code !== 'string' || property_postal_code.trim() === '') errors.push('property_postal_code is missing or invalid.');
  if (assessed_total === null || typeof assessed_total === 'undefined' || typeof assessed_total !== 'number' || assessed_total <= 0) errors.push('assessed_total is missing, invalid, or not a positive number.');

  if (errors.length > 0) {
    console.warn(`Validation failed for lead ID ${leadIdForMsg}: ${errors.join('; ')}`);
    return { isValid: false, errorMessages: errors, validatedLead: lead };
  }
  return { isValid: true, errorMessages: [], validatedLead: lead as FineCutLead };
}

export async function logToSupabaseTable( // Renamed from logToSupabase for clarity
  supabaseClient: SupabaseClient, // Changed from Promise
  logData: Partial<EngineLogEntry>,
  leadIdForLog?: string | number | null, // Made optional and clearer
  campaignIdForLog?: string | null // Made optional and clearer
): Promise<void> {
  try {
    const { error } = await supabaseClient
      .from('engine_log')
      .insert([logData]);
    if (error) {
      console.error('Error logging to Supabase in logToSupabaseTable:', error.message);
      await logSystemEvent({
          event_type: 'ENGINE_LOGGING_ERROR', // More generic event type
          message: `Failed to log to Supabase table 'engine_log': ${error.message}`,
          details: { error, lead_id: leadIdForLog, for_campaign_id: campaignIdForLog, log_data_preview: Object.keys(logData), original_lead_id: String(leadIdForLog) },
          campaign_id: campaignIdForLog === null ? undefined : campaignIdForLog, // Use the passed campaignId
      });
    }
  } catch (e: unknown) {
    console.error('Exception in logToSupabaseTable:', e);
    // Avoid logging a logSystemEvent about a logSystemEvent failure if that's the cause.
    // This function failing should not halt the main process.
  }
}
