// src/app/api/engine/test-email/workflow/fetchActiveSender-helper.ts
import { SupabaseClient } from '@supabase/supabase-js';
import { createAdminServerClient } from '@/lib/supabase/server';
import { logSystemEvent } from '@/services/logService';

import type { SenderData } from './_types'; // Adjusted path

export async function fetchActiveSender(
  supabase: SupabaseClient,
  assignedSenderId: string,
  campaignId?: string,
  marketRegionNormalizedName?: string
): Promise<SenderData> {
  const { data: sender, error: senderError } = await supabase
    .from('senders')
    .select('id, sender_email, sender_name, status')
    .eq('id', assignedSenderId)
    .eq('is_active', true)
    .limit(1)
    .maybeSingle<SenderData>();

  if (senderError) {
    console.error('Supabase error fetching sender by assignedSenderId:', senderError.message);
    await logSystemEvent({
      event_type: 'ENGINE_FETCH_SENDER_ERROR', 
      message: `Error fetching active sender by assigned ID: ${senderError.message}`,
      details: { error: senderError, marketRegion: marketRegionNormalizedName },
      campaign_id: campaignId,
    });
    throw new Error(`Database error fetching active sender by assigned ID: ${senderError.message}`);
  }

  if (!sender) {
    await logSystemEvent({
      event_type: 'ENGINE_NO_ACTIVE_SENDER', 
      message: 'No active sender found by assigned ID.',
      details: { marketRegion: marketRegionNormalizedName },
      campaign_id: campaignId,
    });
    throw new Error('No active sender found in Supabase by assigned ID.');
  }
  
  const validatedSender: SenderData = {
    id: sender.id,
    sender_email: sender.sender_email,
    sender_name: sender.sender_name,
    status: sender.status,
  };
  
  if (!validatedSender.id || !validatedSender.sender_email || !validatedSender.sender_name || !validatedSender.status) {
      await logSystemEvent({
        event_type: 'ENGINE_SENDER_DATA_INCOMPLETE',
        message: 'Fetched active sender by assigned ID is missing essential fields (id, email, name, status).',
        details: { sender_id: assignedSenderId, fetched_sender_preview: sender, marketRegion: marketRegionNormalizedName },
        campaign_id: campaignId,
        level: 'error',
      });
      throw new Error('Active sender data (fetched by assigned ID) is incomplete.');
  }
  return validatedSender;
}
