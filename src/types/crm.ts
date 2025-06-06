// src/types/crm.ts

// Define the possible views for the SPA
export type CrmView = 
  | 'dashboard'
  | 'leads'
  | 'senders'
  | 'crm'
  | 'settings';

export interface CrmLead {
  [key: string]: unknown;
  contact_email?: string | null;
  // contact_name?: string | null; // Removed
  first_name?: string | null; // Added
  last_name?: string | null; // Added
  contact_phone?: string | null;
  contact_type: string;
  converted: boolean;
  created_at: string;
  id: number;
  market_region?: string | null;
  mls_curr_days_on_market?: string | null;
  mls_curr_status?: string | null;
  notes?: string | null;
  property_address?: string | null; // This is the main address for geocoding etc.
  street_address?: string | null; // Added - specific street line if different/needed
  property_city?: string | null;
  property_postal_code?: string | null;
  property_state?: string | null;
  property_type?: string | null;
  status?: string | null; // Already existed
  year_built?: string | null;
  baths?: string | null;
  beds?: string | null;
  square_footage?: string | null;
  lot_size_sqft?: string | null;
  assessed_total?: number | null;
}

export interface Sender {
  id: string | number;
  user_id?: string;
  name: string;
  email: string;
  is_active: boolean;
  is_default?: boolean;
  created_at: string;
  updated_at: string;
  photo_url?: string | null;
  status_message?: string | null;
}
