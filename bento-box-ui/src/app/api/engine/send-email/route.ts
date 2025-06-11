// src/app/api/engine/send-email/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createAdminServerClient } from '@/lib/supabase/server';
import { sendEmail } from '@/services/gmailService';
import { generateLoiPdf, PersonalizationData } from '@/services/pdfService';
import { generateOfferDetails } from '@/actions/offerCalculations';
import path from 'path';
import { configure, Environment as NunjucksEnvironment } from 'nunjucks';
import type { Database, Tables } from '@/types';

// Define shorter types for convenience
type Job = Database['public']['Tables']['campaign_jobs']['Row'];
type Lead = Database['public']['Tables']['leads']['Row'];
type Campaign = Database['public']['Tables']['campaigns']['Row'];
type Sender = Database['public']['Tables']['senders']['Row'];

// Helper to log job outcomes
async function logJobOutcome(
  supabase: ReturnType<typeof createAdminServerClient>,
  jobId: string,
  message: string,
  details?: object
) {
  const { error } = await supabase.from('job_logs').insert({
    job_id: jobId,
    log_message: message,
    details: details || {},
  });
  if (error) {
    console.error(`Failed to log outcome for job ${jobId}:`, error);
  }
}

// Main API handler triggered by the database worker
export async function POST(request: NextRequest) {
  const supabase = createAdminServerClient();
  let job: (Job & { lead: Lead | null; campaign: Campaign | null; sender: Sender | null; }) | null = null;

  const { job_id } = await request.json();

  if (!job_id) {
    return NextResponse.json({ success: false, error: 'job_id is required.' }, { status: 400 });
  }

  try {
    // Fetch the template directory path from the database first
    const { data: setting, error: settingError } = await supabase
      .from('application_settings')
      .select('value')
      .eq('key', 'template_directory')
      .single();

    if (settingError || !setting?.value) {
      throw new Error(`Configuration error: 'template_directory' setting not found in database. ${settingError?.message || ''}`);
    }

    // Configure Nunjucks with the path from the database
    const templateDir = path.join(process.cwd(), setting.value);
    const nunjucksEnv: NunjucksEnvironment = configure(templateDir, { autoescape: true });


    // 1. Fetch the job and all related data
    const { data: jobData, error: jobError } = await supabase
      .from('campaign_jobs')
      .select(`
        *,
        lead:leads(*),
        campaign:campaigns(*),
        sender:senders(*)
      `)
      .eq('id', job_id)
      .single();

    if (jobError || !jobData) {
      throw new Error(`Job with ID ${job_id} not found or failed to fetch. Error: ${jobError?.message}`);
    }

    job = jobData as any; // Cast to the joined type

    if (!job.lead || !job.campaign || !job.sender) {
        throw new Error(`Job ${job_id} is missing required relational data (lead, campaign, or sender).`);
    }

    const { lead, campaign, sender } = job;

    // 2. Prepare Email Content & PDF
    const offerDetails = generateOfferDetails(lead.assessed_total || 0, `${lead.first_name} ${lead.last_name}`);
    const personalizationData: PersonalizationData = {
      ...lead,
      ...offerDetails,
      greeting_name: lead.first_name || 'Property Owner',
      sender_name: sender.sender_name,
      sender_title: "Acquisitions Director", // TODO: Move to a setting
      company_name: "True Soul Partners LLC", // TODO: Move to a setting
    };

    const subjectTemplate = nunjucksEnv.renderString(
        job.campaign?.subject_template || "Offer for your property at {{property_address}}",
        personalizationData
    );
    const htmlBody = nunjucksEnv.render('email_body_with_subject.html', personalizationData);

    const pdfBuffer = await generateLoiPdf(personalizationData, String(lead.id), lead.email || '');
    if (!pdfBuffer) {
      throw new Error("PDF generation failed.");
    }

    // 3. Send Email
    const emailResult = await sendEmail(
      sender.sender_email,
      lead.email,
      subjectTemplate,
      htmlBody,
      [{
        filename: `LOI_${lead.property_address?.replace(/\s/g, '_')}.pdf`,
        content: pdfBuffer,
        contentType: 'application/pdf',
      }]
    );

    // 4. Update Job Status and Log Outcome
    if (emailResult.success && emailResult.globalMessageId) {
      await supabase.from('campaign_jobs').update({
        status: 'completed',
        updated_at: new Date().toISOString()
      }).eq('id', job.id);

      await logJobOutcome(supabase, job.id, 'Email sent successfully.', { messageId: emailResult.globalMessageId });

      return NextResponse.json({ success: true, message: `Job ${job.id} processed successfully.` });
    } else {
      throw new Error(String(emailResult.error) || 'Unknown email sending error.');
    }

  } catch (error: any) {
    const errorMessage = error.message || 'An unexpected error occurred.';
    console.error(`Critical error processing job ${job_id}:`, errorMessage);

    if (job) {
      await supabase.from('campaign_jobs').update({
        status: 'failed',
        retries: (job.retries || 0) + 1,
        updated_at: new Date().toISOString(),
      }).eq('id', job.id);
      await logJobOutcome(supabase, job.id, 'Job processing failed.', { error: errorMessage });
    }

    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 });
  }
}