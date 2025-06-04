// Shared type definitions for the test email workflow
import { createAdminServerClient } from '@/lib/supabase/server'; // For EmailDispatchFullParams
import { FineCutLead } from '@/types/supabase'; // For LeadData

export interface RequestPayload {
  marketRegionNormalizedName: string;
  leadId?: string;
  sendPdf?: boolean;
  sendToLead?: boolean;
  campaignId?: string;
}

export interface SenderData {
  id: string;
  sender_name: string;
  sender_email: string;
  status: string;
}

export interface MarketDetails { // Though not directly used by functions, moved for completeness
  market_region_normalized_name: string;
}

export type LeadData = FineCutLead; // Extends FineCutLead

export interface EmailAssets {
  subject: string;
  htmlBody: string;
  textBody: string;
  templateContext: Record<string, unknown>;
  logoBuffer?: Buffer; // Buffer is a global type in Node.js
  logoContentType?: string;
}

// This was the original generic EmailDispatchParams, not used by the new functions directly
// but moved for completeness if it was intended for other uses.
// export interface EmailDispatchParams { ... } 

export interface EngineLogEntry {
  id?: number;
  created_at?: string;
  contact_name?: string | null;
  contact_email?: string | null;
  property_address?: string | null;
  property_city?: string | null;
  property_state?: string | null;
  property_postal_code?: string | null;
  property_type?: string | null;
  baths?: number | null;
  beds?: number | null;
  year_built?: number | null;
  square_footage?: number | null;
  assessed_total?: number | null;
  market_region?: string | null;
  mls_curr_status?: string | null;
  mls_curr_days_on_market?: number | null;
  sender_name?: string | null;
  sender_email_used?: string | null;
  email_subject_sent?: string | null;
  email_body_preview_sent?: string | null;
  email_status: string;
  email_error_message?: string | null;
  email_sent_at?: string | null;
  campaign_id?: string | null;
  campaign_run_id?: string | null;
  converted?: boolean | null;
  [key: string]: unknown;
}

export interface EmailDispatchFullParams {
  supabase: ReturnType<typeof createAdminServerClient>;
  sender: SenderData;
  lead: FineCutLead;
  emailAssets: EmailAssets;
  pdfBuffer: Buffer | null;
  sendToLead: boolean;
  testRecipientEmail: string;
  testRecipientName: string;
  campaignId?: string;
  marketRegionNormalizedName?: string;
}
