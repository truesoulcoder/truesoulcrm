import { createAdminServerClient } from '@/lib/supabase/server';

/**
 * Inserts a system event log entry into the system_event_logs table.
 * @param event_type - e.g., 'ERROR', 'INFO', 'CAMPAIGN_STATUS', etc.
 * @param message - Short description of the event.
 * @param details - Optional details (object or stringified JSON).
 * @param campaign_id - Optional campaign id for scoping.
 * @param user_id - Optional user id for scoping.
 */
export async function logSystemEvent({
  event_type,
  message,
  details,
  campaign_id,
  user_id,
  level,
}: {
  event_type: string;
  message: string;
  details?: any;
  campaign_id?: string;
  user_id?: string;
  level?: string;
}) {
  const supabase = createAdminServerClient();
  const { error } = await (await supabase).from('system_event_logs').insert({
    event_type,
    message,
    details: details ? (typeof details === 'string' ? details : JSON.stringify(details)) : null,
    campaign_id,
    user_id,
    level,
    created_at: new Date().toISOString(),
  });
}
