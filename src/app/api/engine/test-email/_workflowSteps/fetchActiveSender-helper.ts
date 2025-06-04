// src/app/api/engine/test-email/workflow/fetchActiveSender-helper.ts
import { createAdminServerClient } from '@/lib/supabase/server';
import { logSystemEvent } from '@/services/logService';

import type { SenderData } from './_types'; // Adjusted path

export async function fetchActiveSender(
  supabase: ReturnType<typeof createAdminServerClient>,
  campaignId?: string,
  marketRegionNormalizedName?: string
): Promise<SenderData> {
  const client = await supabase;
  const { data: sender, error: senderError } = await client
    .from('senders')
    .select('sender_email, sender_name, credentials_json, is_default, email, name, created_at')
    .eq('is_active', true)
    .eq('status', 'active')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle<SenderData>();

  if (senderError) {
    console.error('Supabase error fetching sender:', senderError.message);
    await logSystemEvent({
      event_type: 'ENGINE_FETCH_SENDER_ERROR', 
      message: `Error fetching active sender: ${senderError.message}`,
      details: { error: senderError, marketRegion: marketRegionNormalizedName },
      campaign_id: campaignId,
    });
    throw new Error(`Database error fetching active sender: ${senderError.message}`);
  }

  if (!sender) {
    await logSystemEvent({
      event_type: 'ENGINE_NO_ACTIVE_SENDER', 
      message: 'No active sender found.',
      details: { marketRegion: marketRegionNormalizedName },
      campaign_id: campaignId,
    });
    throw new Error('No active sender found in Supabase.');
  }
  
  const validatedSender: SenderData = {
    ...sender,
    sender_email: sender.sender_email,
    sender_name: sender.sender_name,
    email: sender.email || sender.sender_email,
    name: sender.name || sender.sender_name,
    credentials_json: sender.credentials_json,
    is_default: sender.is_default,
  };
  
  if (!validatedSender.sender_email || !validatedSender.sender_name || !validatedSender.credentials_json) {
      await logSystemEvent({
        event_type: 'ENGINE_SENDER_DATA_INCOMPLETE',
        message: 'Fetched active sender is missing essential fields (email, name, or credentials).',
        details: { sender_id: (sender as any).id, marketRegion: marketRegionNormalizedName },
        campaign_id: campaignId,
      });
      throw new Error('Active sender data is incomplete.');
  }
  return validatedSender;
}
