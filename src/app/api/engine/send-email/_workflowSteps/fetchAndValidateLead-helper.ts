// src/app/api/engine/send-email/_workflowSteps/fetchAndValidateLead-helper.ts
import { validateLeadFields } from '@/app/api/engine/send-email/_workflowSteps/_utils'; // Corrected path
import { SupabaseClient } from '@supabase/supabase-js'; // Ensure SupabaseClient is imported
import { logSystemEvent } from '@/services/logService';
import { FineCutLead } from '@/types/leads';


const MAX_LEAD_FETCH_ATTEMPTS = 20;

function hasMessage(error: unknown): error is { message: string } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof (error as Error).message === 'string'
  );
}

export async function fetchAndValidateLead(
  supabase: SupabaseClient,
  leadTableName: string,
  marketRegionNormalizedName: string,
  specificLeadIdToTest?: string | number,
  campaignId?: string
): Promise<FineCutLead> {
  let leadToProcess: FineCutLead | null = null;

  if (specificLeadIdToTest) {
    await logSystemEvent({ event_type: 'ENGINE_LEAD_FETCH_ATTEMPT', message: `Attempting to fetch specific lead ID: ${specificLeadIdToTest} from ${leadTableName}.`, details: { lead_id: specificLeadIdToTest, table: leadTableName, marketRegion: marketRegionNormalizedName }, campaign_id: campaignId });
    const { data: specificLead, error: specificLeadError } = await supabase
      .from(leadTableName)
      .select('*')
      .eq('id', specificLeadIdToTest)
      .maybeSingle<FineCutLead>();
    if (specificLeadError) {
      const errorMsg = hasMessage(specificLeadError)
        ? specificLeadError.message
        : JSON.stringify(specificLeadError);
      await logSystemEvent({ event_type: 'ENGINE_LEAD_FETCH_ERROR', message: `Database error fetching specific lead ID ${specificLeadIdToTest} from ${leadTableName}: ${errorMsg}`, details: { error: specificLeadError, lead_id: specificLeadIdToTest, table: leadTableName, marketRegion: marketRegionNormalizedName }, campaign_id: campaignId });
      throw new Error(`DB error fetching specific lead ${specificLeadIdToTest}: ${errorMsg}`);
    }
    if (!specificLead) {
      await logSystemEvent({ event_type: 'ENGINE_LEAD_FETCH_ERROR', message: `Specific lead ID ${specificLeadIdToTest} not found in ${leadTableName}.`, details: { lead_id: specificLeadIdToTest, table: leadTableName, marketRegion: marketRegionNormalizedName }, campaign_id: campaignId });
      throw new Error(`Lead ID ${specificLeadIdToTest} not found in ${leadTableName}.`);
    }
    leadToProcess = specificLead;
  } else {
    await logSystemEvent({ event_type: 'ENGINE_LEAD_FETCH_ATTEMPT', message: `Attempting to find a suitable lead by iterating through ${leadTableName}. Max attempts: ${MAX_LEAD_FETCH_ATTEMPTS}.`, details: { table: leadTableName, max_attempts: MAX_LEAD_FETCH_ATTEMPTS, marketRegion: marketRegionNormalizedName }, campaign_id: campaignId });
    for (let attempt = 0; attempt < MAX_LEAD_FETCH_ATTEMPTS; attempt++) {
      const { data: candidateLeads, error: leadFetchError } = await supabase
        .from(leadTableName)
        .select('*')
        .order('id', { ascending: true })
        .range(attempt, attempt);
      if (leadFetchError) {
        const errorMsg = hasMessage(leadFetchError)
          ? leadFetchError.message
          : JSON.stringify(leadFetchError);

        await logSystemEvent({ event_type: 'ENGINE_LEAD_FETCH_ERROR', message: `DB error fetching lead (attempt ${attempt + 1}) from ${leadTableName}: ${errorMsg}`, details: { error: leadFetchError, attempt: attempt + 1, table: leadTableName, marketRegion: marketRegionNormalizedName }, campaign_id: campaignId });
        console.error(`DB error on attempt ${attempt + 1} from ${leadTableName}: ${errorMsg}. Continuing attempts.`);
        continue;
      }
      if (!candidateLeads || candidateLeads.length === 0) {
        await logSystemEvent({ event_type: 'ENGINE_LEAD_FETCH_INFO', message: `No more leads available in ${leadTableName} to check (attempt ${attempt + 1}).`, details: { table: leadTableName, attempt: attempt + 1, marketRegion: marketRegionNormalizedName }, campaign_id: campaignId });
        break; 
      }
      const candidateLead = candidateLeads[0] as FineCutLead;
      const { isValid } = validateLeadFields(candidateLead, candidateLead.id ?? `attempt_${attempt + 1}`); // Using imported util
      if (isValid) {
        leadToProcess = candidateLead;
        await logSystemEvent({ event_type: 'ENGINE_LEAD_FETCH_SUCCESS', message: `Suitable lead found after ${attempt + 1} attempts. Lead ID: ${leadToProcess.id}.`, details: { lead_id: leadToProcess.id, attempts: attempt + 1, table: leadTableName, marketRegion: marketRegionNormalizedName }, campaign_id: campaignId });
        break;
      } else {
         await logSystemEvent({ event_type: 'ENGINE_LEAD_VALIDATION_SKIPPED', message: `Lead ID ${candidateLead.id ?? `attempt_${attempt+1}`} fetched but failed validation. Skipping.`, details: { lead_id: candidateLead.id, table: leadTableName, attempt: attempt + 1, marketRegion: marketRegionNormalizedName }, campaign_id: campaignId });
      }
    }
    if (!leadToProcess) {
      await logSystemEvent({ event_type: 'ENGINE_LEAD_FETCH_ERROR', message: `No suitable lead found in ${leadTableName} after ${MAX_LEAD_FETCH_ATTEMPTS} attempts.`, details: { attempts: MAX_LEAD_FETCH_ATTEMPTS, table: leadTableName, marketRegion: marketRegionNormalizedName }, campaign_id: campaignId });
      throw new Error(`No suitable lead found in ${leadTableName} after ${MAX_LEAD_FETCH_ATTEMPTS} checks. Ensure leads have all required fields.`);
    }
  }

  const { isValid, errorMessages, validatedLead } = validateLeadFields(leadToProcess, leadToProcess?.id ?? 'unknown'); // Using imported util
  if (!isValid || !validatedLead) {
    const leadIdForError = leadToProcess?.id || specificLeadIdToTest || 'unknown';
    await logSystemEvent({ event_type: 'ENGINE_LEAD_VALIDATION_ERROR', message: `Chosen lead ID ${leadIdForError} failed final validation: ${errorMessages.join('; ')}`, details: { lead_id: leadIdForError, errors: errorMessages, table: leadTableName, marketRegion: marketRegionNormalizedName }, campaign_id: campaignId });
    throw new Error(`Lead validation failed for ID ${leadIdForError}: ${errorMessages.join('; ')}`);
  }
  await logSystemEvent({ event_type: 'ENGINE_LEAD_VALIDATION_SUCCESS', message: `Lead ID ${validatedLead.id} successfully fetched and validated.`, details: { lead_id: validatedLead.id, table: leadTableName, marketRegion: marketRegionNormalizedName }, campaign_id: campaignId });
  return validatedLead;
}
