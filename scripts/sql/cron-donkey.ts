// crondonkey.ts
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import axios from 'axios';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const API_BASE_URL = process.env.API_BASE_URL!;
const MAX_RETRIES = 5;

async function fetchScheduledJobs() {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('campaign_jobs')
    .select('*')
    .eq('status', 'pending')
    .gte('next_processing_time', now)
    .order('next_processing_time', { ascending: true });

  if (error) {
    console.error('[CronDonkey] Failed to fetch jobs:', error.message);
    return [];
  }

  return data ?? [];
}

async function markJobFailed(jobId: string) {
  await supabase
    .from('campaign_jobs')
    .update({ status: 'failed', updated_at: new Date().toISOString() })
    .eq('id', jobId);
}

async function attemptJob(jobId: string, retryCount = 0): Promise<void> {
  try {
    const res = await axios.post(`${API_BASE_URL}/api/start-campaign`, {
      job_id: jobId,
    });

    if (res.status >= 400) throw new Error(`API returned ${res.status}`);
    console.log(`[CronDonkey] ✅ Job ${jobId} completed successfully`);
  } catch (err: any) {
    console.warn(`[CronDonkey] ⚠️ Job ${jobId} failed (attempt ${retryCount}): ${err.message}`);

    if (retryCount >= MAX_RETRIES) {
      console.error(`[CronDonkey] ❌ Job ${jobId} permanently failed after ${MAX_RETRIES} attempts`);
      await markJobFailed(jobId);
      return;
    }

    const delay = Math.pow(2, retryCount) * 1000; // exponential delay
    console.log(`[CronDonkey] ⏳ Retrying job ${jobId} in ${delay / 1000}s`);
    setTimeout(() => void attemptJob(jobId, retryCount + 1), delay);
  }
}

async function scheduleJob(job: any) {
  const runAt = new Date(job.next_processing_time).getTime();
  const now = Date.now();
  const delay = runAt - now;

  if (delay < 0) {
    console.warn(`[CronDonkey] Skipping job ${job.id} — time already passed`);
    return;
  }

  console.log(`[CronDonkey] Scheduled job ${job.id} for ${delay / 1000}s from now`);

  setTimeout(() => {
    console.log(`[CronDonkey] 🚀 Executing job ${job.id} at`, new Date().toISOString());
    void attemptJob(job.id);
  }, delay);
}

async function run() {
  console.log('[CronDonkey] 🐴 Loading scheduled jobs...');
  const jobs = await fetchScheduledJobs();

  if (!jobs.length) {
    console.log('[CronDonkey] 💤 No pending jobs found.');
    return;
  }

  for (const job of jobs) {
    void scheduleJob(job);
  }

  console.log(`[CronDonkey] 🎯 All jobs scheduled.`);
}

run().catch((err) => {
  console.error('[CronDonkey] Fatal error:', err);
  process.exit(1);
});
