// src/types/leads.ts
export interface FineCutLead {
  id: number;
  normalized_lead_id?: string | null;
  contact_name?: string | null; // Full name
  contact_email?: string | null;
  property_address?: string | null;
  property_city?: string | null;
  property_state?: string | null;
  property_postal_code?: string | null;
  assessed_total?: number | null; // Used for offer calculation
  // The following are typically calculated or come from other sources:
  // offer_price, closing_date_preference, current_date, greeting_name
  [key: string]: any; // Allows for other properties from the database table
}
