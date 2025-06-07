-- ==========[ 1. Initial Cleanup & Schema Reset ]==========
-- This section ensures a clean slate by removing old, redundant objects.
-- It's best to run this on a development project first.

DROP FUNCTION IF EXISTS "public"."create_market_specific_fine_cut_leads_table"(text, uuid);
DROP FUNCTION IF EXISTS "public"."create_market_specific_fine_cut_leads_table"(text);
DROP FUNCTION IF EXISTS "public"."schedule_campaign_by_id_offset"(uuid, interval);
DROP FUNCTION IF EXISTS "public"."schedule_campaign_by_offset_id"(interval, uuid);
DROP FUNCTION IF EXISTS "public"."truncate_normalized_leads"();

DROP TABLE IF EXISTS "public"."campaign_jobs_backup";
DROP TABLE IF EXISTS "public"."engine_control";
DROP TABLE IF EXISTS "public"."engine_status";
DROP TABLE IF EXISTS "public"."system_state";
-- Drop all the old market-specific tables
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename LIKE '%_fine_cut_leads') LOOP
        EXECUTE 'DROP TABLE IF EXISTS public.' || quote_ident(r.tablename) || ' CASCADE';
    END LOOP;
END$$;


-- ==========[ 2. Define Clean, Unified Custom Types ]==========
-- Consolidating status enums for clarity and data integrity.

CREATE TYPE public.campaign_status AS ENUM ('draft', 'active', 'paused', 'completed', 'archived');
CREATE TYPE public.campaign_job_status AS ENUM ('scheduled', 'processing', 'completed', 'failed');
CREATE TYPE public.engine_status AS ENUM ('running', 'paused', 'stopped');


-- ==========[ 3. Create Refined, Centralized Tables ]==========
-- Standardizing on UUIDs and creating clear, logical relationships.

CREATE TABLE IF NOT EXISTS public.campaigns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    status public.campaign_status NOT NULL DEFAULT 'draft',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.campaigns IS 'Stores high-level campaign definitions and their current status.';

CREATE TABLE IF NOT EXISTS public.leads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    first_name TEXT,
    last_name TEXT,
    -- Denormalized property data for easy access
    property_address TEXT,
    property_city TEXT,
    property_state TEXT,
    property_postal_code TEXT,
    market_region TEXT, -- Simplified market region as a text field. Can be a FK to a 'markets' table if needed.
    -- Add other normalized lead properties here
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- Ensures an email can only be in the system once per user to avoid duplicates.
    UNIQUE(user_id, email)
);
COMMENT ON TABLE public.leads IS 'Unified table for all normalized, ready-to-use leads across all markets.';

CREATE TABLE IF NOT EXISTS public.campaign_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id UUID NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
    lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
    status public.campaign_job_status NOT NULL DEFAULT 'scheduled',
    next_processing_time TIMESTAMPTZ NOT NULL,
    retries INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.campaign_jobs IS 'The master schedule for all email sending actions.';
-- Create an index for the worker to quickly find jobs to process.
CREATE INDEX IF NOT EXISTS idx_scheduled_jobs_to_process ON public.campaign_jobs (status, next_processing_time) WHERE (status = 'scheduled');


CREATE TABLE IF NOT EXISTS public.campaign_engine_state (
    id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    -- A campaign can only have one engine state at a time.
    campaign_id UUID NOT NULL UNIQUE REFERENCES public.campaigns(id) ON DELETE CASCADE,
    status public.engine_status NOT NULL DEFAULT 'stopped',
    paused_at TIMESTAMPTZ, -- Records when a campaign was paused to calculate the resume delta.
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.campaign_engine_state IS 'The master control switch for each campaign, managed by the UI.';


CREATE TABLE IF NOT EXISTS public.job_logs (
    id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    job_id UUID NOT NULL REFERENCES public.campaign_jobs(id) ON DELETE CASCADE,
    log_message TEXT NOT NULL,
    details JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.job_logs IS 'Logs the outcome of each campaign job execution for debugging and history.';


-- ==========[ 4. Create Universal Triggers ]==========
-- A single, reusable function to update the `updated_at` timestamp on any table.

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply the trigger to all tables that have an `updated_at` column.
CREATE TRIGGER handle_campaign_update BEFORE UPDATE ON public.campaigns FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();
CREATE TRIGGER handle_lead_update BEFORE UPDATE ON public.leads FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();
CREATE TRIGGER handle_job_update BEFORE UPDATE ON public.campaign_jobs FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();
CREATE TRIGGER handle_engine_state_update BEFORE UPDATE ON public.campaign_engine_state FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();


-- ==========[ 5. Create Serverless Database Functions ]==========
-- This is the logic that completely replaces crondonkey.py.

-- Main Worker Function: The heart of the serverless engine.
CREATE OR REPLACE FUNCTION process_next_campaign_job()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  running_campaign RECORD;
  job_to_process RECORD;
  request_id BIGINT;
  anon_key TEXT;
  base_url TEXT;
BEGIN
  -- 1. Find a campaign that is currently set to 'running'.
  SELECT * INTO running_campaign FROM public.campaign_engine_state WHERE status = 'running' LIMIT 1;
  IF running_campaign IS NULL THEN
    RETURN 'Engine is stopped. No campaigns to process.';
  END IF;

  -- 2. Find the next due job for that campaign and lock it.
  SELECT * INTO job_to_process
  FROM public.campaign_jobs
  WHERE
    campaign_id = running_campaign.campaign_id AND
    status = 'scheduled' AND
    next_processing_time <= now()
  ORDER BY next_processing_time ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF job_to_process IS NULL THEN
    RETURN 'No pending jobs for campaign ' || running_campaign.campaign_id;
  END IF;

  -- 3. Mark job as 'processing' to prevent double-sends.
  UPDATE public.campaign_jobs SET status = 'processing' WHERE id = job_to_process.id;
  
  -- 4. Securely get keys and trigger the 'send-email' Edge Function.
  SELECT decrypted_secret INTO anon_key FROM vault.decrypted_secrets WHERE name = 'supabase_anon_key';
  base_url := current_setting('supa.functions_url', true);

  -- This calls your existing API for sending the email.
  -- The send-email function should update the job to 'completed' or 'failed' and log the result.
  SELECT id INTO request_id FROM net.http_post(
      url := base_url || '/send-email',
      headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || anon_key
      ),
      body := jsonb_build_object('job_id', job_to_process.id)
  );

  INSERT INTO public.job_logs(job_id, log_message, details)
  VALUES (job_to_process.id, 'Triggered send-email function.', jsonb_build_object('http_request_id', request_id));

  RETURN 'Processed job ' || job_to_process.id;

EXCEPTION
  WHEN OTHERS THEN
    IF job_to_process.id IS NOT NULL THEN
      UPDATE public.campaign_jobs SET status = 'failed' WHERE id = job_to_process.id;
      INSERT INTO public.job_logs(job_id, log_message, details)
      VALUES (job_to_process.id, 'Failed to process job.', jsonb_build_object('error', SQLERRM));
    END IF;
    RETURN 'Error: ' || SQLERRM;
END;
$$;

-- Resume Logic Function: Adjusts the schedule after a campaign is paused.
CREATE OR REPLACE FUNCTION adjust_schedule_on_resume(campaign_id_to_resume UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  state RECORD;
  time_delta INTERVAL;
BEGIN
  SELECT * INTO state FROM public.campaign_engine_state WHERE campaign_id = campaign_id_to_resume;
  IF state IS NULL OR state.paused_at IS NULL THEN
    RETURN 'Error: Campaign was not paused or does not exist.';
  END IF;

  time_delta := now() - state.paused_at;

  -- Add the paused duration to all future jobs for this campaign.
  UPDATE public.campaign_jobs
  SET next_processing_time = next_processing_time + time_delta
  WHERE 
    campaign_id = campaign_id_to_resume AND
    status = 'scheduled' AND
    next_processing_time > state.paused_at;

  UPDATE public.campaign_engine_state SET paused_at = NULL WHERE campaign_id = campaign_id_to_resume;
  RETURN 'Schedule adjusted by ' || time_delta;
END;
$$;


-- ==========[ Step 6: Enable Row Level Security (RLS) and Define Policies ]==========
-- A secure default: block everything, then open up access based on user roles.

ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage their own campaigns" ON public.campaigns
  FOR ALL USING (auth.uid() = user_id);

ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage their own leads" ON public.leads
  FOR ALL USING (auth.uid() = user_id);

ALTER TABLE public.campaign_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view jobs for their campaigns" ON public.campaign_jobs
  FOR SELECT USING (
    campaign_id IN (SELECT id FROM public.campaigns WHERE user_id = auth.uid())
  );

ALTER TABLE public.campaign_engine_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can control their own campaigns" ON public.campaign_engine_state
  FOR ALL USING (
    campaign_id IN (SELECT id FROM public.campaigns WHERE user_id = auth.uid())
  );

ALTER TABLE public.job_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view logs for their jobs" ON public.job_logs
  FOR SELECT USING (
    job_id IN (SELECT id FROM public.campaign_jobs WHERE campaign_id IN (SELECT id FROM public.campaigns WHERE user_id = auth.uid()))
  );


-- ==========[ Step 7: Enable Realtime Publications ]==========
-- Turn on realtime for the tables your dashboard needs to listen to.
ALTER PUBLICATION supabase_realtime ADD TABLE public.campaign_jobs, public.job_logs, public.campaign_engine_state;


-- ==========[ Step 8: Schedule the Worker with pg_cron ]==========
-- The final step. Go to your Supabase Dashboard -> Database -> Cron Jobs and create this job.
-- This command tells Supabase to run your worker function every minute, forever.
--
-- Name:     process_campaign_jobs
-- Schedule: * * * * *
-- Command:  SELECT process_next_campaign_job();

-- You can also run this SQL to schedule it (but the dashboard is easier):
/*
SELECT cron.schedule(
  'process_campaign_jobs',
  '* * * * *',
  'SELECT process_next_campaign_job();'
);
*/