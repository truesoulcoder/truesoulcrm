export type CampaignStatus = 'draft' | 'active' | 'running' | 'paused' | 'completed';

// export type JobStatus = 'pending' | 'processing' | 'completed' | 'failed';

export enum CampaignJobStatus {
  Pending = 'pending',
  Processing = 'processing', // General processing state
  ProcessingAPI = 'processing_api', // Specifically when the API route picks it up
  Sent = 'sent',
  Completed = 'completed', // Generic completed, 'Sent' is more specific for emails
  Failed = 'failed', // General failure, retryable
  FailedPermanent = 'failed_permanent', // Non-retryable failure
  Skipped = 'skipped' // If a job is intentionally skipped
}

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
  id: string; // Ensuring this is string, as used in route.ts
  status: CampaignJobStatus;
  contact_name: string | null;
  contact_email: string | null;
  assigned_sender_id: string | null;
  next_processing_time: string | null;
  error_message?: string | null;
  processed_at?: string | null;
  campaign_id: string; // Ensuring this is string and not optional if always present
  lead_id: string; // Added missing lead_id
  email_message_id?: string | null; // Added missing email_message_id
  market_region?: string | null;
}