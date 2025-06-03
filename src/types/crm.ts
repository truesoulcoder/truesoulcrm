// src/types/crm.ts

// Define the possible views for the SPA
export type CrmView = 
  | 'dashboard'
  | 'leads'
  | 'senders'
  | 'crm'
  | 'settings';

export interface CrmLead {
  contact_email?: string | null;
  contact_name?: string | null;
  contact_phone?: string | null;
  contact_type: string;
  converted: boolean;
  created_at: string;
  id: number;
  market_region?: string | null;
  mls_curr_days_on_market?: string | null;
  mls_curr_status?: string | null;
  notes?: string | null;
  property_address?: string | null;
  property_city?: string | null;
  property_postal_code?: string | null;
  property_state?: string | null;
  property_type?: string | null;
  status?: string | null;
  year_built?: string | null;
  baths?: string | null;
  beds?: string | null;
  square_footage?: string | null;
  lot_size_sqft?: string | null;
  assessed_total?: number | null;
}
