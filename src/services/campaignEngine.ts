// External dependencies
import { Lead, prepareAndSendOfferEmail, SenderInfo } from '@/actions/emailSending.action';
// Internal dependencies
import { getAdminSupabaseClient } from '@/services/supabaseAdminService';
import { Tables, TablesInsert, Database } from '@/types/supabase';

// Local services
import { logSystemEvent } from './logService';
import { generatePdfFromHtml } from './pdfService';

// Simple template rendering function with proper type safety
const renderTemplate = (template: string, data: Record<string, unknown>): string => {
  return template.replace(/\{\{\s*(.*?)\s*\}\}/g, (_, key: string) => {
    const value = data[key.trim()];
    return value !== undefined && value !== null ? String(value) : '';
  });
};

// Type for the lead data used in email sending, aligned with Lead interface
interface EmailLead {
  id: number;
  contact1_name: string; // Assuming contact1 is always present for an EmailLead
  contact1_email_1: string; // Assuming contact1_email_1 is always present
  contact2_name?: string | undefined;
  contact2_email_1?: string | undefined;
  contact3_name?: string | undefined;
  contact3_email_1?: string | undefined;
  property_address: string; // Assuming property_address is always present
  assessed_total: number; // Assuming assessed_total is always present
  mls_curr_list_agent_name?: string | undefined;
  mls_curr_list_agent_email?: string | undefined;
  // Add other fields from Lead if they are used by prepareAndSendOfferEmail or templates
  [key: string]: any; // To match Lead interface for flexibility if needed
}

// Database types
type GeneratedDocument = Database['public']['Tables']['generated_documents']['Row'];
type CampaignJob = Tables<'campaign_jobs'> & {
  normalized_lead_id: number;
};

type NormalizedLead = Tables<'normalized_leads'> & {
  id: number;
  contact1_name?: string | undefined;
  contact1_email_1?: string | undefined;
  contact2_name?: string | undefined;
  contact2_email_1?: string | undefined;
  contact3_name?: string | undefined;
  contact3_email_1?: string | undefined;
  wholesale_value?: number | null;
  property_address?: string | undefined;
  property_city?: string | undefined; // Added for denormalization
  property_state?: string | undefined; // Added for denormalization
  property_zip_code?: string | undefined; // Added for denormalization
  market_region?: string | undefined; // Added for denormalization
  assessed_total?: number | null; // Added for consistency with EmailLead/Lead
  mls_curr_list_agent_name?: string | undefined;
  mls_curr_list_agent_email?: string | undefined;
  // Add other fields as necessary from your normalized_leads table
  [key: string]: any; // For flexibility if other fields are fetched
};

type CampaignSenderAllocation = Tables<'campaign_sender_allocations'> & {
  sender_id: string;
  sent_today: number;
  total_sent: number;
  next_available_at?: string | null; // Ensure this property is recognized
};

type EmailTask = TablesInsert<'email_tasks'> & {
  id: string;
  campaign_job_id: string;
  assigned_sender_id: string;
  contact_email: string;
  status: string;
  attachments?: Array<{
    name: string;
    path: string;
    type: string;
    document_id?: string;
  }> | null;
  pdf_generated?: boolean;
  sent_at?: string | null;
  updated_at?: string;
  created_at?: string;
};

const supabase = getAdminSupabaseClient();

const SAFETY_MODE = process.env.SAFETY_MODE === 'true';
const SAFETY_EMAIL = process.env.TEST_RECIPIENT_EMAIL;

if (SAFETY_MODE && !SAFETY_EMAIL) {
  throw new Error('TEST_RECIPIENT_EMAIL environment variable is required when SAFETY_MODE is enabled');
}

/**
 * Main loop to process a campaign.
 */
export async function processCampaign(campaignId: string) {
  // Fetch campaign with templates
  const { data: campaignData, error: campErr } = await supabase
    .from('campaigns')
    .select(`*, template:templates(id,subject,content), pdf_template:templates(id,content)`)
    .eq('id', campaignId)
    .single();
  if (campErr || !campaignData) {
    await logSystemEvent({
      event_type: 'ERROR',
      message: 'Campaign not found',
      details: { campaignId, error: campErr },
      campaign_id: campaignId
    });
    throw new Error('Campaign not found');
  }
  const campaign = campaignData;
  
  // Preflight checks are now handled by the dashboard
  // The campaign engine will only process leads when status is ACTIVE
  
  // Ensure we have required templates
  if (!campaign.template?.subject || !campaign.template?.content) {
    await logSystemEvent({
      event_type: 'ERROR',
      message: 'Missing email template',
      details: { campaignId },
      campaign_id: campaignId
    });
    throw new Error('Missing required email template');
  }

  // Main processing loop
  while (true) {
    // Check campaign status
    const { data: statusRow } = await supabase.from('campaigns').select('status').eq('id', campaignId).single();
    
    // If campaign is not active, wait and check again
    if (statusRow?.status !== 'ACTIVE') {
      if (statusRow?.status === 'STOPPING') {
        await supabase.from('campaigns').update({ status: 'STOPPED' }).eq('id', campaignId);
        await import('./logService').then(({ logSystemEvent }) =>
          logSystemEvent({
            event_type: 'CAMPAIGN_STATUS',
            message: 'Campaign stopped',
            campaign_id: campaignId
          })
        );
        break;
      }
      
      // Wait longer before checking status again (pre-flight/awaiting confirmation)
      await new Promise(resolve => setTimeout(resolve, 60000));
      continue;
    }

    // Quota enforcement
    if (campaign.quota > 0) {
      const { count } = await supabase
        .from('campaign_jobs')
        .select('id', { count: 'exact' })
        .eq('campaign_id', campaignId)
        .eq('status', 'COMPLETED_SUCCESS');
      if (count! >= campaign.quota) {
        await supabase.from('campaigns').update({ status: 'COMPLETED' }).eq('id', campaignId);
        await import('./logService').then(({ logSystemEvent }) =>
          logSystemEvent({
            event_type: 'CAMPAIGN_STATUS',
            message: 'Campaign completed (quota reached)',
            campaign_id: campaignId
          })
        );
        break;
      }
    }

    // Get processed lead IDs
    const { data: jobRows } = await supabase.from('campaign_jobs').select('lead_id').eq('campaign_id', campaignId) as { data: { lead_id: number }[] };
    const usedIds = jobRows?.map(r => r.lead_id) || [];

    // Select next lead
    const query = supabase.from('normalized_leads').select('*').limit(1);
    if (campaign.market_region) query.eq('market_region', campaign.market_region);
    if (usedIds.length) query.not('id', 'in', `(${usedIds.join(',')})`);
    const { data: leads } = await query as { data: NormalizedLead[] };
    if (!leads || leads.length === 0) {
      await supabase.from('campaigns').update({ status: 'COMPLETED' }).eq('id', campaignId);
      await import('./logService').then(({ logSystemEvent }) =>
        logSystemEvent({
          event_type: 'CAMPAIGN_STATUS',
          message: 'Campaign completed (no leads left)',
          campaign_id: campaignId
        })
      );
      break;
    }

    // Pick the next lead and optionally override for safety mode
    const lead = leads[0];
    const effectiveLead = SAFETY_MODE
      ? { ...lead, contact1_email_1: SAFETY_EMAIL, contact2_email_1: SAFETY_EMAIL, contact3_email_1: SAFETY_EMAIL }
      : lead;

    // Create job
    const { data: jobData } = await supabase.from('campaign_jobs').insert({ campaign_id: campaignId, lead_id: lead.id, status: 'PROCESSING', started_at: new Date().toISOString() }).single() as { data: CampaignJob };
    const jobId = jobData!.id;
    let jobErrors = false;

    // Build recipient list: up to 3 contacts + MLS agent
    type ValidRecipient = { name: string; email: string };
    const recipients = SAFETY_MODE && SAFETY_EMAIL
      ? [{ name: 'Test', email: SAFETY_EMAIL } as ValidRecipient]
      : SAFETY_MODE
      ? [] // Skip if in safety mode but no TEST_RECIPIENT_EMAIL is set
      : [
          { name: lead.contact1_name, email: lead.contact1_email_1 },
          { name: lead.contact2_name, email: lead.contact2_email_1 },
          { name: lead.contact3_name, email: lead.contact3_email_1 },
          { name: lead.mls_curr_list_agent_name, email: lead.mls_curr_list_agent_email },
        ].filter((r): r is ValidRecipient => !!r.email && !!r.name);

    for (const recipient of recipients) {
      // Pick user allocation
      const now = new Date().toISOString();
      const { data: allocs } = await supabase
        .from('campaign_sender_allocations')
        .select(`
          *,
          senders (id, full_name, title, email_address)
        `)
        .eq('campaign_id', campaignId)
        .lt('sent_today', 'daily_quota')
        .or(`next_available_at.is.null,next_available_at.lt.${now}`)
        .order('total_sent', { ascending: true })
        .limit(1);

      const allocData = allocs?.[0] as (CampaignSenderAllocation & { senders: { id: string; full_name: string; title: string; email_address: string } | null }) | undefined;

      if (!allocData || !allocData.senders) {
        await logSystemEvent({
          event_type: 'WARNING',
          message: 'No available senders or sender details missing for campaign',
          details: { campaignId, senderId: allocData?.sender_id },
          campaign_id: campaignId
        });
        jobErrors = true;
        break; // No senders available or details missing, stop processing this job's recipients
      }

      // This is the sender for email sending (impersonation details)
      const senderForEmail: SenderInfo = {
        id: allocData.senders.id, // The database ID of the sender
        fullName: allocData.senders.full_name,
        title: allocData.senders.title,
        email: allocData.senders.email_address,
      };

      // This is the allocation record for counter updates and interval logic
      const alloc = { 
        id: allocData.id, 
        sender_id: allocData.sender_id, 
        daily_quota: allocData.daily_quota,
        sent_today: allocData.sent_today,
        total_sent: allocData.total_sent,
        campaign_id: allocData.campaign_id,
        next_available_at: allocData.next_available_at,
        created_at: allocData.created_at,
        updated_at: allocData.updated_at
      } as CampaignSenderAllocation;

      // Create a lead data object for this specific recipient
      let leadData: EmailLead;
      if (recipient.name === lead.contact1_name) {
        leadData = {
          id: Number(effectiveLead.id) || 0,
          contact1_name: recipient.name,
          contact1_email_1: recipient.email,
          contact2_name: '',
          contact2_email_1: '',
          contact3_name: '',
          contact3_email_1: '',
          property_address: effectiveLead.property_address || '',
          assessed_total: effectiveLead.assessed_total || 0,
          mls_curr_list_agent_name: lead.mls_curr_list_agent_name || '',
          mls_curr_list_agent_email: lead.mls_curr_list_agent_email || '',
        };
      } else if (recipient.name === lead.contact2_name) {
        leadData = {
          id: Number(effectiveLead.id) || 0,
          contact1_name: '',
          contact1_email_1: '',
          contact2_name: recipient.name,
          contact2_email_1: recipient.email,
          contact3_name: '',
          contact3_email_1: '',
          property_address: effectiveLead.property_address || '',
          assessed_total: effectiveLead.assessed_total || 0,
          mls_curr_list_agent_name: lead.mls_curr_list_agent_name || '',
          mls_curr_list_agent_email: lead.mls_curr_list_agent_email || '',
        };
      } else if (recipient.name === lead.contact3_name) {
        leadData = {
          id: Number(effectiveLead.id) || 0,
          contact1_name: '',
          contact1_email_1: '',
          contact2_name: '',
          contact2_email_1: '',
          contact3_name: recipient.name,
          contact3_email_1: recipient.email,
          property_address: effectiveLead.property_address || '',
          assessed_total: effectiveLead.assessed_total || 0,
          mls_curr_list_agent_name: lead.mls_curr_list_agent_name || '',
          mls_curr_list_agent_email: lead.mls_curr_list_agent_email || '',
        };
      } else {
        leadData = {
          id: Number(effectiveLead.id) || 0,
          contact1_name: '',
          contact1_email_1: '',
          contact2_name: '',
          contact2_email_1: '',
          contact3_name: '',
          contact3_email_1: '',
          property_address: effectiveLead.property_address || '',
          assessed_total: effectiveLead.assessed_total || 0,
          mls_curr_list_agent_name: recipient.name,
          mls_curr_list_agent_email: recipient.email,
        };
      }

      // Draft email task
      const emailSubject = renderTemplate(campaign.template?.subject || '', effectiveLead as Record<string, unknown>);
      const body = renderTemplate(campaign.template?.content || '', effectiveLead as Record<string, unknown>);
      
      // Create email task in database
      const taskInsert = await supabase
        .from('email_tasks')
        .insert({ 
          campaign_job_id: jobId, 
          assigned_sender_id: alloc.sender_id, 
          contact_email: recipient.email, 
          subject: emailSubject, 
          body, 
          status: 'SENDING' 
        })
        .select()
        .single();
      
      if (!taskInsert.data) {
        throw new Error('Failed to create email task');
      }
      
      const task = taskInsert.data as EmailTask;

      try {
        // Generate PDF if needed
        let attachments;
        if (campaign.pdf_template && campaign.pdf_template.content) {
          const pdfHtml = renderTemplate(campaign.pdf_template.content, effectiveLead);
          const pdfBuf = await generatePdfFromHtml(pdfHtml);
          const propertyAddress = effectiveLead.property_address || 'property';
          const safeFilename = propertyAddress
            .replace(/[^a-z0-9]/gi, '_')
            .replace(/_{2,}/g, '_')
            .replace(/^_|_$/g, '');
          attachments = [{ 
            filename: `Letter of Intent - ${safeFilename}.pdf`, 
            content: pdfBuf
          }];
        }

        let retries = 0;
        let sent = false;
        while (retries < 3 && !sent) {
          try {
            const result = await prepareAndSendOfferEmail(
              leadData,
              senderForEmail, // Use the correctly typed SenderInfo
              {
                subject: emailSubject,
                body,
                attachments,
                pdfBuffer: attachments?.[0]?.content, // Pass buffer if available
                leadData: effectiveLead, // Pass full lead data for template rendering in action
              }
            );
            // Determine contact_type
            let contactType = 'unknown';
            if (recipient.email === lead.contact1_email_1) contactType = 'contact1';
            else if (recipient.email === lead.contact2_email_1) contactType = 'contact2';
            else if (recipient.email === lead.contact3_email_1) contactType = 'contact3';
            else if (recipient.email === lead.mls_curr_list_agent_email) contactType = 'agent';

            // Insert into campaign_leads
            if (result.messageId && result.threadId) {
              if (!campaign.user_id) {
                console.error(`Campaign user_id is missing for campaign ${campaign.id}, cannot insert into campaign_leads for lead ${lead.id}`);
                await logSystemEvent({
                  event_type: 'ERROR',
                  message: 'Campaign user_id is missing, cannot insert campaign_lead',
                  details: { campaignId: String(campaign.id), leadId: String(lead.id) },
                  campaign_id: String(campaign.id)
                });
                // Potentially skip this lead or handle error more gracefully
              } else {
                const campaignLeadEntry: TablesInsert<'campaign_leads'> = {
                  campaign_id: String(campaign.id),
                  normalized_lead_id: String(lead.id),
                  user_id: campaign.user_id, // Now confirmed to be present
                  added_at: new Date().toISOString(),
                  status: 'NEW', // Initial status for a new lead in a campaign
                  // id (PK) will be auto-generated by Supabase or a DB trigger if not provided
                };

                const { data: newCampaignLead, error: campaignLeadError } = await supabase
                  .from('campaign_leads')
                  .insert(campaignLeadEntry)
                  .select()
                  .single(); // Assuming you want the inserted row back

                if (campaignLeadError) {
                  console.error('Error inserting into campaign_leads:', campaignLeadError);
                  await logSystemEvent({
                    event_type: 'ERROR',
                    message: 'Failed to insert into campaign_leads',
                    details: { campaignId: String(campaign.id), leadId: String(lead.id), error: campaignLeadError },
                    campaign_id: String(campaign.id)
                  });
                  // Decide if this error should mark the job as failed or just log
                } else if (newCampaignLead) {
                  // Successfully inserted, newCampaignLead.id can be used if needed for campaign_log
                  console.log(`Successfully inserted campaign_lead for campaign ${campaign.id}, lead ${lead.id}. CampaignLeadID: ${newCampaignLead.id}`);

                  // Now, log the email sending event to campaign_log
                  const campaignLogEntry: TablesInsert<'campaign_log'> = {
                    campaign_id: String(campaign.id),
                    campaign_lead_id: newCampaignLead.id, // Link to the campaign_leads entry
                    user_id: campaign.user_id, // Already checked for presence
                    event_type: 'EMAIL_SENT',
                    message: `Email sent to ${contactType}: ${recipient.email}`,
                    status: 'SUCCESS',
                    external_message_id: result.messageId, // Store Gmail message ID
                    target_identifier: recipient.email,
                    sender_id: senderForEmail.id, // Use senderForEmail from the prepareAndSendOfferEmail call
                    details_json: {
                      threadId: result.threadId,
                      contactName: recipient.name, // Original recipient name
                      leadId: String(lead.id),
                      emailSubject, // Use the 'emailSubject' variable defined earlier
                      // any other details deemed useful
                    },
                    logged_at: new Date().toISOString(),
                  };

                  const { error: campaignLogError } = await supabase
                    .from('campaign_log')
                    .insert(campaignLogEntry);

                  if (campaignLogError) {
                    console.error('Error inserting into campaign_log:', campaignLogError);
                    await logSystemEvent({
                      event_type: 'ERROR',
                      message: 'Failed to insert into campaign_log for EMAIL_SENT event',
                      details: { campaignId: String(campaign.id), leadId: String(lead.id), campaignLeadId: newCampaignLead.id, error: campaignLogError },
                      campaign_id: String(campaign.id)
                    });
                  } else {
                    console.log(`Successfully logged EMAIL_SENT event for campaign_lead ${newCampaignLead.id}`);
                  }
                }
              }
            }

            await supabase
              .from('email_tasks')
              .update({ 
                status: 'SENT',
                sent_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
                gmail_message_id: result.messageId || undefined,
                gmail_thread_id: result.threadId || undefined, // Added thread_id
                contact_email: recipient.email
              })
              .eq('id', task.id)
              .eq('contact_email', recipient.email);
            await supabase.rpc('increment_sender_counters', {
              p_sender_id: alloc.sender_id,
              p_campaign_id: campaign.id,
              p_increment_sent: 1
            });
            sent = true;
          } catch (error) {
            retries++;
            if (retries < 3) {
              await new Promise(resolve => setTimeout(resolve, 30000));
            } else {
              await supabase
                .from('email_tasks')
                .update({ status: 'FAILED', updated_at: new Date().toISOString() })
                .eq('id', task.id)
                .eq('contact_email', recipient.email);
              console.error(`Failed to send email to ${recipient.email} after 3 retries:`, error);
            }
          }
        }
      } catch (err) {
        console.error('Error processing email:', err);
        jobErrors = true;
        
        // Log the error
        await logSystemEvent({
          event_type: 'ERROR',
          message: 'Failed to send email',
          details: { 
            error: err instanceof Error ? err.message : String(err),
            campaignId,
            recipient: recipient.email,
            senderId: alloc?.sender_id
          },
          campaign_id: campaignId
        });
        
        // Update task as failed
        if (task?.id) {
          await supabase
            .from('email_tasks')
            .update({ 
              status: 'FAILED',
              error: err instanceof Error ? err.message : String(err),
              updated_at: new Date().toISOString()
            })
            .eq('id', task.id);
        }
      }
    }

    // Update job status
    const finalStatus = jobErrors ? 'COMPLETED_WITH_ERRORS' : 'COMPLETED_SUCCESS';
    await supabase
      .from('campaign_jobs')
      .update({ 
        status: finalStatus, 
        completed_at: new Date().toISOString() 
      })
      .eq('id', jobId);
      
    // Update lead status based on job result
    await supabase
      .from('normalized_leads')
      .update({ 
        status: finalStatus === 'COMPLETED_SUCCESS' ? 'WORKED' : 'FAILED',
        updated_at: new Date().toISOString()
      })
      .eq('id', lead.id);
      
    // Add delay between jobs if configured
    if (campaign.job_delay_seconds && campaign.job_delay_seconds > 0) {
      await new Promise(resolve => setTimeout(resolve, campaign.job_delay_seconds * 1000));
    }
  }
}

/**
 * Starts a campaign: marks active and triggers processing asynchronously.
 * Only starts if campaign is in AWAITING_CONFIRMATION status.
 */
export async function startCampaign(campaignId: string) {
  // First, verify the campaign is in AWAITING_CONFIRMATION status
  const { data: campaign, error: fetchError } = await supabase
    .from('campaigns')
    .select('status')
    .eq('id', campaignId)
    .single();

  if (fetchError) {
    console.error('Error fetching campaign status:', fetchError);
    throw new Error('Failed to verify campaign status');
  }

  if (campaign.status !== 'AWAITING_CONFIRMATION') {
    throw new Error(`Campaign must be in AWAITING_CONFIRMATION status to start. Current status: ${campaign.status}`);
  }

  // Update status to ACTIVE
  const { error: updateError } = await supabase
    .from('campaigns')
    .update({ 
      status: 'ACTIVE',
      updated_at: new Date().toISOString()
    })
    .eq('id', campaignId);

  if (updateError) {
    console.error('Error updating campaign status:', updateError);
    throw new Error('Failed to start campaign');
  }

  // Log the status change
  await import('./logService').then(({ logSystemEvent }) =>
    logSystemEvent({
      event_type: 'CAMPAIGN_STATUS',
      message: 'Campaign started',
      campaign_id: campaignId
    })
  );

  // Start processing the campaign
  processCampaign(campaignId).catch(async error => {
    console.error('Campaign processing error:', error);
    await import('./logService').then(({ logSystemEvent }) =>
      logSystemEvent({
        event_type: 'ERROR',
        message: 'Campaign processing error',
        details: { campaignId, error },
        campaign_id: campaignId
      })
    );
  });
}

/**
 * Signals the campaign loop to stop after current job.
 */
export async function stopCampaign(campaignId: string) {
  await supabase
    .from('campaigns')
    .update({ status: 'STOPPING' })
    .eq('id', campaignId);
  await import('./logService').then(({ logSystemEvent }) =>
    logSystemEvent({
      event_type: 'CAMPAIGN_STATUS',
      message: 'Campaign stopping',
      campaign_id: campaignId
    })
  );
}
