-- Supabase Schema Setup Script for CRM Admin
-- Version 2.0 (Based on Codebase Review)

-- Enable UUID generation if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;

-- Helper function to update 'updated_at' columns
CREATE OR REPLACE FUNCTION public.trigger_set_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

--------------------------------------
-- 1. PROFILES TABLE
--------------------------------------
-- Stores additional user-specific information, extending Supabase auth.users.
DROP TABLE IF EXISTS public.profiles CASCADE;
CREATE TABLE public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name TEXT,
    avatar_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE public.profiles IS 'User profile information, extending Supabase auth.users.';
-- Trigger for updated_at
CREATE TRIGGER set_profiles_updated_at
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.trigger_set_timestamp();

--------------------------------------
-- 2. EMAIL SENDERS TABLE
--------------------------------------
-- Stores information about configured email senders (employee emails for outreach).
DROP TABLE IF EXISTS public.email_senders CASCADE;
CREATE TABLE public.email_senders (
    id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE, -- The app user who configured this sender
    name TEXT NOT NULL, -- Employee's full name or a display name for the sender
    email TEXT NOT NULL, -- The actual email address to be used for sending
    avatar_url TEXT, -- URL to the sender's profile picture (synced from Gmail)
    is_active BOOLEAN DEFAULT TRUE NOT NULL,
    is_default BOOLEAN DEFAULT FALSE NOT NULL,
    credentials_json JSONB, -- For storing OAuth tokens or other credentials if needed directly
    last_authorized_at TIMESTAMPTZ,
    status_message TEXT, -- e.g., 'Authorization required', 'Active'
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);
ALTER TABLE public.email_senders ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE public.email_senders IS 'Configured email senders for outreach campaigns.';
COMMENT ON COLUMN public.email_senders.user_id IS 'The app user (from auth.users) who configured this sender.';
-- Unique constraint for email per configuring user
CREATE UNIQUE INDEX uq_email_sender_email_per_user ON public.email_senders(user_id, email);
-- Unique constraint for default sender per user
CREATE UNIQUE INDEX uq_default_sender_per_user ON public.email_senders(user_id, is_default) WHERE (is_default = TRUE);
-- Trigger for updated_at
CREATE TRIGGER set_email_senders_updated_at
BEFORE UPDATE ON public.email_senders
FOR EACH ROW
EXECUTE FUNCTION public.trigger_set_timestamp();

--------------------------------------
-- 3. DOCUMENT TEMPLATES TABLE
--------------------------------------
-- Stores templates for emails or other documents.
DROP TABLE IF EXISTS public.document_templates CASCADE;
CREATE TABLE public.document_templates (
    id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('email', 'pdf')), -- 'email', 'pdf'
    subject TEXT, -- Required if type is 'email'
    content TEXT, -- HTML content for emails, or base HTML for PDFs
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    is_active BOOLEAN DEFAULT TRUE NOT NULL,
    deleted_at TIMESTAMPTZ, -- For soft deletes
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);
ALTER TABLE public.document_templates ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE public.document_templates IS 'Reusable templates for emails and other documents.';
-- Trigger for updated_at
CREATE TRIGGER set_document_templates_updated_at
BEFORE UPDATE ON public.document_templates
FOR EACH ROW
EXECUTE FUNCTION public.trigger_set_timestamp();

--------------------------------------
-- 4. LEADS (STAGING) TABLE
--------------------------------------
-- Staging table for raw data uploaded from CSV files.
DROP TABLE IF EXISTS public.leads CASCADE;
CREATE TABLE public.leads (
    id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
    uploaded_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    original_filename TEXT NOT NULL,
    market_region TEXT NOT NULL,
    raw_data JSONB NOT NULL, -- Stores the entire parsed row from CSV
    normalization_status TEXT DEFAULT 'PENDING' NOT NULL CHECK (normalization_status IN ('PENDING', 'PROCESSED', 'ERROR')),
    normalization_error TEXT,
    uploaded_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE public.leads IS 'Staging table for raw lead data uploaded from CSV files.';
COMMENT ON COLUMN public.leads.raw_data IS 'Stores the original parsed row data from the CSV as JSON.';
-- Trigger for updated_at
CREATE TRIGGER set_leads_updated_at
BEFORE UPDATE ON public.leads
FOR EACH ROW
EXECUTE FUNCTION public.trigger_set_timestamp();

--------------------------------------
-- 5. NORMALIZED LEADS TABLE
--------------------------------------
-- Stores cleaned and structured lead data ready for use in campaigns.
DROP TABLE IF EXISTS public.normalized_leads CASCADE;
CREATE TABLE public.normalized_leads (
    id BIGSERIAL PRIMARY KEY,
    original_lead_id UUID UNIQUE REFERENCES public.leads(id) ON DELETE SET NULL, -- Link to the staged lead
    market_region TEXT,

    -- Contact fields (prioritizing first contact, others available)
    contact1_name TEXT,
    contact1_email_1 TEXT,
    contact2_name TEXT,
    contact2_email_1 TEXT,
    contact3_name TEXT,
    contact3_email_1 TEXT,
    mls_curr_list_agent_name TEXT,
    mls_curr_list_agent_email TEXT,

    -- Property details
    property_address TEXT,
    property_city TEXT,
    property_state TEXT,
    property_postal_code TEXT,
    property_type TEXT,
    baths TEXT, -- Kept as TEXT as per current types, can be NUMERIC if parsing is guaranteed
    beds TEXT,  -- Kept as TEXT
    year_built TEXT, -- Kept as TEXT
    square_footage TEXT, -- Kept as TEXT
    lot_size_sqft TEXT, -- Added from type review

    -- Financial and AVM details
    wholesale_value NUMERIC,
    assessed_total NUMERIC,
    avm_value NUMERIC, -- From lead upload form / type
    price_per_sq_ft NUMERIC, -- Added from type review

    -- MLS details
    mls_curr_status TEXT,
    mls_curr_days_on_market TEXT,

    converted BOOLEAN DEFAULT FALSE NOT NULL, -- Tracks if a lead has responded or been converted
    status TEXT, -- e.g., 'New', 'Contacted', 'Qualified', 'Lost', 'Won' (from Lead type)
    source TEXT, -- From Lead type
    notes TEXT,  -- From Lead type

    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);
ALTER TABLE public.normalized_leads ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE public.normalized_leads IS 'Cleaned and structured lead data for campaigns.';
-- Indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_norm_leads_market_region ON public.normalized_leads(market_region);
CREATE INDEX IF NOT EXISTS idx_norm_leads_contact1_email ON public.normalized_leads(contact1_email_1);
CREATE INDEX IF NOT EXISTS idx_norm_leads_property_full_addr ON public.normalized_leads(property_address, property_city, property_state, property_postal_code);
-- Trigger for updated_at
CREATE TRIGGER set_normalized_leads_updated_at
BEFORE UPDATE ON public.normalized_leads
FOR EACH ROW
EXECUTE FUNCTION public.trigger_set_timestamp();

--------------------------------------
-- 6. CAMPAIGNS TABLE
--------------------------------------
-- Defines outreach campaigns.
DROP TABLE IF EXISTS public.campaigns CASCADE;
CREATE TABLE public.campaigns (
    id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE, -- The app user who owns/created this campaign
    name TEXT NOT NULL,
    description TEXT,
    status TEXT DEFAULT 'DRAFT' NOT NULL CHECK (status IN ('DRAFT', 'ACTIVE', 'PAUSED', 'STOPPING', 'STOPPED', 'COMPLETED', 'ARCHIVED')),
    email_template_id UUID REFERENCES public.document_templates(id) ON DELETE SET NULL,
    pdf_template_id UUID REFERENCES public.document_templates(id) ON DELETE SET NULL, -- For PDF attachments
    target_market_region TEXT, -- Filters leads from normalized_leads by this region
    lead_status_trigger TEXT, -- e.g. process leads with this status from normalized_leads
    daily_sending_limit_per_sender INT, -- Max emails a sender can send per day for this campaign
    total_quota INT, -- Max total leads to process for this campaign (0 or NULL for unlimited)
    is_active BOOLEAN GENERATED ALWAYS AS (status = 'ACTIVE') STORED, -- Computed column
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);
ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE public.campaigns IS 'Defines outreach campaigns and their settings.';
-- Trigger for updated_at
CREATE TRIGGER set_campaigns_updated_at
BEFORE UPDATE ON public.campaigns
FOR EACH ROW
EXECUTE FUNCTION public.trigger_set_timestamp();

--------------------------------------
-- 7. CAMPAIGN USER ALLOCATIONS TABLE
--------------------------------------
-- Manages sender quotas and stats per campaign.
DROP TABLE IF EXISTS public.campaign_user_allocations CASCADE;
CREATE TABLE public.campaign_user_allocations (
    id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
    campaign_id UUID NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
    email_sender_id UUID NOT NULL REFERENCES public.email_senders(id) ON DELETE CASCADE, -- Link to the actual sender
    daily_quota INT NOT NULL DEFAULT 0,
    sent_today INT NOT NULL DEFAULT 0,
    total_sent INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    CONSTRAINT uq_campaign_sender UNIQUE (campaign_id, email_sender_id)
);
ALTER TABLE public.campaign_user_allocations ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE public.campaign_user_allocations IS 'Manages quotas and stats for each sender in a campaign.';
-- Trigger for updated_at
CREATE TRIGGER set_campaign_user_allocations_updated_at
BEFORE UPDATE ON public.campaign_user_allocations
FOR EACH ROW
EXECUTE FUNCTION public.trigger_set_timestamp();

--------------------------------------
-- 8. CAMPAIGN JOBS TABLE
--------------------------------------
-- Tracks the processing of an individual lead within a campaign.
DROP TABLE IF EXISTS public.campaign_jobs CASCADE;
CREATE TABLE public.campaign_jobs (
    id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
    campaign_id UUID NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
    normalized_lead_id BIGINT NOT NULL REFERENCES public.normalized_leads(id) ON DELETE CASCADE,
    status TEXT NOT NULL CHECK (status IN ('PENDING', 'PROCESSING', 'COMPLETED_SUCCESS', 'COMPLETED_WITH_ERRORS', 'FAILED')),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    error_details TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    CONSTRAINT uq_campaign_lead_job UNIQUE (campaign_id, normalized_lead_id) -- Ensures a lead is processed once per campaign
);
ALTER TABLE public.campaign_jobs ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE public.campaign_jobs IS 'Tracks processing of one lead within a campaign.';
-- Trigger for updated_at
CREATE TRIGGER set_campaign_jobs_updated_at
BEFORE UPDATE ON public.campaign_jobs
FOR EACH ROW
EXECUTE FUNCTION public.trigger_set_timestamp();

--------------------------------------
-- 9. EMAIL TASKS TABLE
--------------------------------------
-- Records individual email sending operations related to a campaign job.
DROP TABLE IF EXISTS public.email_tasks CASCADE;
CREATE TABLE public.email_tasks (
    id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
    campaign_job_id UUID NOT NULL REFERENCES public.campaign_jobs(id) ON DELETE CASCADE,
    assigned_sender_id UUID NOT NULL REFERENCES public.email_senders(id) ON DELETE CASCADE, -- The sender account used
    contact_email TEXT NOT NULL, -- Recipient's email address
    subject TEXT,
    body TEXT, -- HTML body of the email sent
    pdf_generated BOOLEAN DEFAULT FALSE NOT NULL,
    attachments JSONB, -- Details of any attachments sent
    status TEXT NOT NULL CHECK (status IN ('PENDING', 'SENDING', 'SENT', 'FAILED_TO_SEND', 'DELIVERED', 'OPENED', 'CLICKED', 'REPLIED')),
    gmail_message_id TEXT, -- Message ID from Gmail API
    error_details TEXT,
    sent_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);
ALTER TABLE public.email_tasks ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE public.email_tasks IS 'Records individual email sending operations for a campaign job.';
-- Trigger for updated_at
CREATE TRIGGER set_email_tasks_updated_at
BEFORE UPDATE ON public.email_tasks
FOR EACH ROW
EXECUTE FUNCTION public.trigger_set_timestamp();

--------------------------------------
-- 10. SYSTEM EVENT LOGS TABLE
--------------------------------------
-- For application-wide logging of important events and errors.
DROP TABLE IF EXISTS public.system_event_logs CASCADE;
CREATE TABLE public.system_event_logs (
    id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
    event_type TEXT NOT NULL, -- e.g., 'ERROR', 'INFO', 'CAMPAIGN_STATUS', 'LEAD_UPLOAD'
    message TEXT NOT NULL,
    details JSONB, -- Flexible field for additional structured information
    campaign_id UUID REFERENCES public.campaigns(id) ON DELETE SET NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL, -- App user related to the event
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);
ALTER TABLE public.system_event_logs ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE public.system_event_logs IS 'Application-wide logging for events and errors.';

--------------------------------------
-- STORAGE BUCKETS (Configuration Guide)
--------------------------------------
-- 1. lead-uploads:
--    - Purpose: Stores raw CSV files uploaded by users.
--    - Access: 
--        - Authenticated users (or specific roles) should have INSERT permissions.
--        - Service role key should have READ/DELETE permissions for processing by normalization function.
--        - Generally should NOT be public.
--    - Example Policy (Conceptual - Apply via Supabase Dashboard or Management API):
--      CREATE POLICY "Allow authenticated uploads" ON storage.objects
--      FOR INSERT TO authenticated
--      WITH CHECK (bucket_id = 'lead-uploads');
--      CREATE POLICY "Allow service role full access to uploads" ON storage.objects
--      FOR ALL TO service_role
--      USING (bucket_id = 'lead-uploads');

-- 2. media:
--    - Purpose: Stores public media files like success/fail sounds.
--    - Access: 
--        - Public READ access.
--        - Admin/Service role for UPLOAD/DELETE.
--    - Example Policy (Conceptual):
--      CREATE POLICY "Public read access for media" ON storage.objects
--      FOR SELECT TO public
--      USING (bucket_id = 'media');
--      CREATE POLICY "Allow admin uploads to media" ON storage.objects
--      FOR INSERT TO service_role -- Or a specific admin role
--      WITH CHECK (bucket_id = 'media');

--------------------------------------
-- ROW LEVEL SECURITY (RLS) POLICIES
--------------------------------------

-- Profiles
CREATE POLICY "Users can view their own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update their own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- Email Senders
CREATE POLICY "Users can manage their own email senders" ON public.email_senders FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Document Templates
CREATE POLICY "Users can manage their own templates or public templates" ON public.document_templates FOR SELECT
  USING (auth.uid() = created_by OR created_by IS NULL);
CREATE POLICY "Users can insert their own templates" ON public.document_templates FOR INSERT
  WITH CHECK (auth.uid() = created_by);
CREATE POLICY "Users can update their own templates" ON public.document_templates FOR UPDATE
  USING (auth.uid() = created_by) WITH CHECK (auth.uid() = created_by);
CREATE POLICY "Users can delete their own templates" ON public.document_templates FOR DELETE
  USING (auth.uid() = created_by);

-- Leads (Staging)
CREATE POLICY "Users can insert their own leads" ON public.leads FOR INSERT
  WITH CHECK (auth.uid() = uploaded_by);
CREATE POLICY "Users can view their own uploaded leads" ON public.leads FOR SELECT
  USING (auth.uid() = uploaded_by);
-- Service role will bypass RLS for normalization.

-- Normalized Leads
-- Access to normalized_leads is typically through campaigns or specific API endpoints that filter by user context.
-- For direct queries, RLS can be complex. Start with service role access for engine processing.
CREATE POLICY "Service role full access for normalized_leads" ON public.normalized_leads FOR ALL TO service_role USING (true) WITH CHECK (true);
-- A restrictive policy for authenticated users if direct table access is needed (usually not recommended):
-- CREATE POLICY "Authenticated users restricted access" ON public.normalized_leads FOR SELECT TO authenticated USING (false); 

-- Campaigns
CREATE POLICY "Users can manage their own campaigns" ON public.campaigns FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Campaign User Allocations
CREATE POLICY "Users can manage allocations for their own campaigns" ON public.campaign_user_allocations FOR ALL
  USING (EXISTS (SELECT 1 FROM public.campaigns c WHERE c.id = campaign_id AND c.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.campaigns c WHERE c.id = campaign_id AND c.user_id = auth.uid()));

-- Campaign Jobs
CREATE POLICY "Users can view jobs for their own campaigns" ON public.campaign_jobs FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.campaigns c WHERE c.id = campaign_id AND c.user_id = auth.uid()));
-- Engine (service role) handles insert/update.
CREATE POLICY "Service role can manage campaign_jobs" ON public.campaign_jobs FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Email Tasks
CREATE POLICY "Users can view tasks for their own campaigns" ON public.email_tasks FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.campaign_jobs cj
    JOIN public.campaigns c ON cj.campaign_id = c.id
    WHERE cj.id = campaign_job_id AND c.user_id = auth.uid()
  ));
-- Engine (service role) handles insert/update.
CREATE POLICY "Service role can manage email_tasks" ON public.email_tasks FOR ALL TO service_role USING (true) WITH CHECK (true);

-- System Event Logs
CREATE POLICY "Users can view logs related to them or their campaigns" ON public.system_event_logs FOR SELECT
  USING (auth.uid() = user_id OR EXISTS (
    SELECT 1 FROM public.campaigns c WHERE c.id = campaign_id AND c.user_id = auth.uid()
  ) OR (campaign_id IS NULL AND user_id IS NULL)); -- Allow viewing global non-sensitive logs
-- Service role for inserts.
CREATE POLICY "Service role can insert system_event_logs" ON public.system_event_logs FOR INSERT TO service_role WITH CHECK (true);


--------------------------------------
-- DATABASE FUNCTIONS (RPC)
--------------------------------------

-- Function to normalize staged leads
CREATE OR REPLACE FUNCTION public.normalize_staged_leads(p_market_region TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER -- Important: Runs with privileges of the function owner (typically admin/postgres)
AS $$
DECLARE
    r RECORD;
    v_original_lead_id UUID;
    v_wholesale_value_text TEXT;
    v_assessed_total_text TEXT;
    v_avm_value_text TEXT;
    v_price_per_sq_ft_text TEXT;
    v_error_details TEXT;
BEGIN
    FOR r IN 
        SELECT id, raw_data, uploaded_by
        FROM public.leads
        WHERE normalization_status = 'PENDING' AND market_region = p_market_region
    LOOP
        BEGIN
            v_original_lead_id := r.id;
            v_error_details := NULL;

            -- Extract and clean monetary values. Add more specific cleaning as needed.
            v_wholesale_value_text := r.raw_data->>'wholesale_value';
            v_assessed_total_text  := r.raw_data->>'assessed_total';
            v_avm_value_text       := r.raw_data->>'avm_value'; -- Assuming 'avm_value' key from CSV/raw_data
            v_price_per_sq_ft_text := r.raw_data->>'price_per_sq_ft';

            INSERT INTO public.normalized_leads (
                original_lead_id, market_region,
                contact1_name, contact1_email_1,
                contact2_name, contact2_email_1,
                contact3_name, contact3_email_1,
                mls_curr_list_agent_name, mls_curr_list_agent_email,
                property_address, property_city, property_state, property_postal_code,
                property_type, baths, beds, year_built, square_footage, lot_size_sqft,
                wholesale_value, assessed_total, avm_value, price_per_sq_ft,
                mls_curr_status, mls_curr_days_on_market,
                -- Defaulting 'converted', 'status', 'source', 'notes' as they are not from typical bulk uploads
                created_at, updated_at 
            )
            VALUES (
                v_original_lead_id, p_market_region,
                r.raw_data->>'contact1_name', LOWER(r.raw_data->>'contact1_email_1'),
                r.raw_data->>'contact2_name', LOWER(r.raw_data->>'contact2_email_1'),
                r.raw_data->>'contact3_name', LOWER(r.raw_data->>'contact3_email_1'),
                r.raw_data->>'mls_curr_list_agent_name', LOWER(r.raw_data->>'mls_curr_list_agent_email'),
                r.raw_data->>'property_address', r.raw_data->>'property_city', 
                r.raw_data->>'property_state', r.raw_data->>'property_zip', -- Mapped from property_postal_code in upload to property_zip in raw_data
                r.raw_data->>'property_type', r.raw_data->>'baths', r.raw_data->>'beds', 
                r.raw_data->>'year_built', r.raw_data->>'square_footage', r.raw_data->>'lot_size_sqft',
                NULLIF(REPLACE(REPLACE(v_wholesale_value_text, '$', ''), ',', ''), '')::NUMERIC, 
                NULLIF(REPLACE(REPLACE(v_assessed_total_text, '$', ''), ',', ''), '')::NUMERIC,
                NULLIF(REPLACE(REPLACE(v_avm_value_text, '$', ''), ',', ''), '')::NUMERIC,
                NULLIF(REPLACE(REPLACE(v_price_per_sq_ft_text, '$', ''), ',', ''), '')::NUMERIC,
                r.raw_data->>'mls_curr_status', r.raw_data->>'mls_curr_days_on_market',
                NOW(), NOW()
            )
            ON CONFLICT (original_lead_id) DO UPDATE SET
                market_region = EXCLUDED.market_region,
                contact1_name = EXCLUDED.contact1_name, contact1_email_1 = EXCLUDED.contact1_email_1,
                contact2_name = EXCLUDED.contact2_name, contact2_email_1 = EXCLUDED.contact2_email_1,
                contact3_name = EXCLUDED.contact3_name, contact3_email_1 = EXCLUDED.contact3_email_1,
                mls_curr_list_agent_name = EXCLUDED.mls_curr_list_agent_name, mls_curr_list_agent_email = EXCLUDED.mls_curr_list_agent_email,
                property_address = EXCLUDED.property_address, property_city = EXCLUDED.property_city,
                property_state = EXCLUDED.property_state, property_postal_code = EXCLUDED.property_postal_code,
                property_type = EXCLUDED.property_type, baths = EXCLUDED.baths, beds = EXCLUDED.beds,
                year_built = EXCLUDED.year_built, square_footage = EXCLUDED.square_footage, lot_size_sqft = EXCLUDED.lot_size_sqft,
                wholesale_value = EXCLUDED.wholesale_value, assessed_total = EXCLUDED.assessed_total, avm_value = EXCLUDED.avm_value, price_per_sq_ft = EXCLUDED.price_per_sq_ft,
                mls_curr_status = EXCLUDED.mls_curr_status, mls_curr_days_on_market = EXCLUDED.mls_curr_days_on_market,
                updated_at = NOW();

            -- Mark the staged lead as processed
            UPDATE public.leads SET normalization_status = 'PROCESSED', updated_at = NOW()
            WHERE id = v_original_lead_id;

        EXCEPTION WHEN OTHERS THEN
            GET STACKED DIAGNOSTICS v_error_details = PG_EXCEPTION_CONTEXT;
            RAISE WARNING 'Error normalizing lead ID %: %, Context: %', v_original_lead_id, SQLERRM, v_error_details;
            UPDATE public.leads 
            SET normalization_status = 'ERROR', normalization_error = SQLERRM || ' | Context: ' || v_error_details, updated_at = NOW()
            WHERE id = v_original_lead_id;
            -- Optionally log to system_event_logs as well
            INSERT INTO public.system_event_logs (event_type, message, details, user_id)
            VALUES ('NORMALIZATION_ERROR', 'Failed to normalize lead', 
                    jsonb_build_object('original_lead_id', v_original_lead_id, 'error', SQLERRM, 'context', v_error_details), 
                    r.uploaded_by);
        END;
    END LOOP;

    -- Optional: Clean up very old 'PROCESSED' leads from staging if desired, or do it in a separate job.
    -- DELETE FROM public.leads WHERE normalization_status = 'PROCESSED' AND uploaded_at < NOW() - INTERVAL '30 days';

    RAISE NOTICE 'Normalization of staged leads for market region % complete.', p_market_region;
END;
$$;

-- Grant execute on the function to authenticated users (or service_role if preferred and called by backend)
GRANT EXECUTE ON FUNCTION public.normalize_staged_leads(TEXT) TO authenticated;
-- If your RLS on 'leads' table restricts service_role for reads/updates, this function being SECURITY DEFINER might bypass it.
-- Ensure the function owner has appropriate permissions if not using SECURITY DEFINER or if RLS is strict.

COMMENT ON FUNCTION public.normalize_staged_leads(TEXT) IS 
'Processes leads from the staging table (public.leads) for a given market region, 
populates the public.normalized_leads table, and updates staging record status. 
Handles conflicts by updating existing normalized leads based on original_lead_id.';

--------------------------------------
-- FINALIZATION
--------------------------------------
RAISE NOTICE 'Supabase CRM Admin schema setup script completed.';
