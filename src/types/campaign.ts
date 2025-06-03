export type CampaignStatus = 'draft' | 'active' | 'running' | 'paused' | 'completed';
export type JobStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface Campaign {
  id: string;
  name: string;
  description: string;
  status: CampaignStatus;
  is_active: boolean;
  market_region: string;
  created_at: string;
  updated_at: string;
  daily_limit: number;
  dry_run: boolean;
  sender_quota: number;
  min_interval_seconds: number;
  max_interval_seconds: number;
}

export interface CampaignJobs {
  id: string;
  status: JobStatus;
  contact_name: string | null;
  contact_email: string | null;
  assigned_sender_id: string | null;
  next_processing_time: string | null;
  error_message?: string | null;
  processed_at?: string | null;
  campaign_id?: string | null;
  market_region?: string | null;
}