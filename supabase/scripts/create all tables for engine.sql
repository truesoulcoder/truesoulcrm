-- Drop existing tables if they exist (in correct order due to foreign key constraints)
DROP TABLE IF EXISTS public.campaign_actions CASCADE;
DROP TABLE IF EXISTS public.email_events CASCADE;
DROP TABLE IF EXISTS public.campaign_jobs CASCADE;
DROP TABLE IF EXISTS public.generated_documents CASCADE;
DROP TABLE IF EXISTS public.campaign_steps CASCADE;
DROP TABLE IF EXISTS public.campaigns CASCADE;
DROP TABLE IF EXISTS public.email_templates CASCADE;
DROP TABLE IF EXISTS public.document_templates CASCADE;
DROP TABLE IF EXISTS public.senders CASCADE;

-- Create senders table for email accounts
CREATE TABLE public.senders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  is_active BOOLEAN DEFAULT true,
  is_default BOOLEAN DEFAULT false,
  credentials_json JSONB,
  daily_limit INTEGER DEFAULT 100,
  sent_today INTEGER DEFAULT 0,
  last_reset_date DATE DEFAULT CURRENT_DATE,
  status TEXT DEFAULT 'active',
  last_authorized_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create email templates table
CREATE TABLE public.email_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  subject TEXT NOT NULL,
  body_html TEXT NOT NULL,
  body_text TEXT,
  placeholders TEXT[],
  created_by UUID REFERENCES auth.users(id) NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create document templates table
CREATE TABLE public.document_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_type TEXT NOT NULL,
  created_by UUID REFERENCES auth.users(id) NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create campaigns table
CREATE TABLE public.campaigns (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'draft', -- draft, active, paused, completed, cancelled
  target_market TEXT,
  lead_status_trigger TEXT NOT NULL DEFAULT 'new',
  is_active BOOLEAN DEFAULT true,
  created_by UUID REFERENCES auth.users(id) NOT NULL,
  email_template_id UUID REFERENCES public.email_templates(id),
  document_template_id UUID REFERENCES public.document_templates(id),
  start_date TIMESTAMP WITH TIME ZONE,
  end_date TIMESTAMP WITH TIME ZONE,
  daily_limit INTEGER DEFAULT 100,
  timezone TEXT DEFAULT 'America/Chicago',
  settings JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create campaign steps table
CREATE TABLE public.campaign_steps (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  campaign_id UUID REFERENCES public.campaigns(id) ON DELETE CASCADE NOT NULL,
  step_number INTEGER NOT NULL,
  action_type TEXT NOT NULL, -- email, delay, etc.
  template_id UUID, -- References email_templates or document_templates
  delay_days INTEGER DEFAULT 0,
  delay_hours INTEGER DEFAULT 0,
  subject_template TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(campaign_id, step_number)
);

-- Create campaign jobs table (tracks email sending jobs)
CREATE TABLE public.campaign_jobs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  campaign_id UUID REFERENCES public.campaigns(id) ON DELETE CASCADE NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- pending, in_progress, completed, failed
  lead_id TEXT NOT NULL, -- Reference to leads table
  email_address TEXT NOT NULL,
  contact_name TEXT,
  assigned_sender_id UUID REFERENCES public.senders(id),
  current_step INTEGER DEFAULT 0,
  next_processing_time TIMESTAMP WITH TIME ZONE,
  error_message TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create generated documents table
CREATE TABLE public.generated_documents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  campaign_id UUID REFERENCES public.campaigns(id) ON DELETE CASCADE NOT NULL,
  campaign_job_id UUID REFERENCES public.campaign_jobs(id) ON DELETE CASCADE,
  template_id UUID REFERENCES public.document_templates(id) NOT NULL,
  file_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_type TEXT NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create campaign actions table (tracks all actions taken)
CREATE TABLE public.campaign_actions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  campaign_id UUID REFERENCES public.campaigns(id) ON DELETE CASCADE NOT NULL,
  campaign_job_id UUID REFERENCES public.campaign_jobs(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL, -- email_sent, email_delivered, email_opened, etc.
  status TEXT NOT NULL, -- pending, in_progress, completed, failed
  details JSONB DEFAULT '{}'::jsonb,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create email events table
CREATE TABLE public.email_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  campaign_id UUID REFERENCES public.campaigns(id) ON DELETE CASCADE,
  campaign_job_id UUID REFERENCES public.campaign_jobs(id) ON DELETE CASCADE,
  action_id UUID REFERENCES public.campaign_actions(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL, -- sent, delivered, opened, clicked, bounced, complained
  recipient_email TEXT NOT NULL,
  message_id TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for better query performance
CREATE INDEX idx_campaigns_created_by ON public.campaigns(created_by);
CREATE INDEX idx_campaigns_status ON public.campaigns(status);
CREATE INDEX idx_campaign_jobs_campaign_id ON public.campaign_jobs(campaign_id);
CREATE INDEX idx_campaign_jobs_status ON public.campaign_jobs(status);
CREATE INDEX idx_campaign_jobs_processing ON public.campaign_jobs(next_processing_time) 
  WHERE status IN ('pending', 'in_progress');
CREATE INDEX idx_campaign_actions_campaign_id ON public.campaign_actions(campaign_id);
CREATE INDEX idx_campaign_actions_job_id ON public.campaign_actions(campaign_job_id);
CREATE INDEX idx_email_events_campaign_id ON public.email_events(campaign_id);
CREATE INDEX idx_email_events_recipient_email ON public.email_events(recipient_email);
CREATE INDEX idx_email_events_created_at ON public.email_events(created_at);
CREATE INDEX idx_email_events_event_type ON public.email_events(event_type);

-- Function to update updated_at timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for updated_at columns
CREATE TRIGGER update_senders_updated_at
BEFORE UPDATE ON public.senders
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_email_templates_updated_at
BEFORE UPDATE ON public.email_templates
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_document_templates_updated_at
BEFORE UPDATE ON public.document_templates
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_campaigns_updated_at
BEFORE UPDATE ON public.campaigns
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_campaign_steps_updated_at
BEFORE UPDATE ON public.campaign_steps
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_campaign_jobs_updated_at
BEFORE UPDATE ON public.campaign_jobs
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_generated_documents_updated_at
BEFORE UPDATE ON public.generated_documents
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_campaign_actions_updated_at
BEFORE UPDATE ON public.campaign_actions
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Enable RLS on all tables
ALTER TABLE public.senders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.generated_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_events ENABLE ROW LEVEL SECURITY;

-- RLS Policies for senders
CREATE POLICY "Enable read access for all users" 
  ON public.senders FOR SELECT USING (true);
  
CREATE POLICY "Enable insert for authenticated users"
  ON public.senders FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');
  
CREATE POLICY "Enable update for owners"
  ON public.senders FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- RLS Policies for email_templates
CREATE POLICY "Enable read access for all users" 
  ON public.email_templates FOR SELECT USING (true);
  
CREATE POLICY "Enable all access for service role"
  ON public.email_templates
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- RLS Policies for document_templates
CREATE POLICY "Enable read access for all users" 
  ON public.document_templates FOR SELECT USING (true);
  
CREATE POLICY "Enable all access for service role"
  ON public.document_templates
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- RLS Policies for campaigns
CREATE POLICY "Enable read access for all users" 
  ON public.campaigns FOR SELECT USING (true);
  
CREATE POLICY "Enable insert for authenticated users"
  ON public.campaigns FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');
  
CREATE POLICY "Enable update for owners"
  ON public.campaigns FOR UPDATE
  USING (auth.uid() = created_by)
  WITH CHECK (auth.uid() = created_by);

-- RLS Policies for campaign_steps
CREATE POLICY "Enable read access for all users" 
  ON public.campaign_steps FOR SELECT USING (true);
  
CREATE POLICY "Enable all access for service role"
  ON public.campaign_steps
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- RLS Policies for campaign_jobs
CREATE POLICY "Enable read access for all users" 
  ON public.campaign_jobs FOR SELECT USING (true);
  
CREATE POLICY "Enable all access for service role"
  ON public.campaign_jobs
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- RLS Policies for generated_documents
CREATE POLICY "Enable read access for all users" 
  ON public.generated_documents FOR SELECT USING (true);
  
CREATE POLICY "Enable all access for service role"
  ON public.generated_documents
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- RLS Policies for campaign_actions
CREATE POLICY "Enable read access for all users" 
  ON public.campaign_actions FOR SELECT USING (true);
  
CREATE POLICY "Enable all access for service role"
  ON public.campaign_actions
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- RLS Policies for email_events
CREATE POLICY "Enable read access for all users" 
  ON public.email_events FOR SELECT USING (true);
  
CREATE POLICY "Enable all access for service role"
  ON public.email_events
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Grant all necessary permissions to service role
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public TO service_role;

-- Function to get campaigns that need processing
CREATE OR REPLACE FUNCTION get_campaigns_to_process()
RETURNS TABLE (
  campaign_id UUID,
  campaign_name TEXT,
  pending_jobs BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    c.id AS campaign_id,
    c.name AS campaign_name,
    COUNT(cj.id) AS pending_jobs
  FROM 
    public.campaigns c
    LEFT JOIN public.campaign_jobs cj ON c.id = cj.campaign_id
      AND cj.status = 'pending'
      AND (cj.next_processing_time IS NULL OR cj.next_processing_time <= NOW())
  WHERE 
    c.status = 'active'
    AND c.is_active = true
  GROUP BY 
    c.id, c.name
  HAVING 
    COUNT(cj.id) > 0;
END;
$$ LANGUAGE plpgsql;