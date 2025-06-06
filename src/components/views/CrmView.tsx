// src/components/views/CrmView.tsx
'use client';

// External dependencies
import { useState, useEffect, useCallback } from 'react'; 

// Utilities and types
import { supabase } from '@/lib/supabase/client';
import OmegaTable from '@/components/layout/OmegaTable';

import type { CrmLead } from '@/types/crm';

// Actions

// Define a more specific type for form data that matches the normalized_leads table structure
export interface CrmFormData {
  id?: number | undefined;
  original_lead_id?: string | null;
  market_region?: string | null;
  
  // Contact fields
  contact_name?: string | null;
  contact_email?: string | null;
  contact_phone?: string | null;
  mls_curr_list_agent_name?: string | null;
  mls_curr_list_agent_email?: string | null;
  
  // Property details
  property_address?: string | null;
  property_city?: string | null;
  property_state?: string | null;
  property_postal_code?: string | null;
  property_type?: string | null;
  beds?: number | null;
  baths?: number | null;
  year_built?: number | null;
  square_footage?: number | null;
  lot_size_sqft?: number | null;
  
  // Financial and AVM details
  wholesale_value?: number | null;
  assessed_total?: number | null;
  avm_value?: number | null;
  price_per_sq_ft?: number | null;
  
  // MLS details
  mls_curr_status?: string | null;
  mls_curr_days_on_market?: string | null;
  
  // Status and metadata
  converted?: boolean;
  status?: string | null;
  source?: string | null;
  notes?: string | null;
  
  // Timestamps
  created_at?: string | undefined;
  updated_at?: string | undefined;
}

// Define MarketRegion type properly
interface MarketRegion {
  id: string;
  name: string;
  normalized_name: string;
  associated_leads_table: string;
}

export default function CrmView() {
  const [leads, setLeads] = useState<CrmLead[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [availableMarkets, setAvailableMarkets] = useState<MarketRegion[]>([]);
  const [marketFilter, setMarketFilter] = useState<string>('all');

  const fetchMarketRegions = useCallback(async () => {
    setIsLoading(true);
    try {
      const { data: markets, error } = await supabase
        .from('market_regions')
        .select('id, name, normalized_name, associated_leads_table');
      
      if (error) throw error;
      setAvailableMarkets(markets || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const fetchLeads = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      let result;
      if (marketFilter === 'all') {
        // Fetch all markets data
        const allResponses = await Promise.all(
          availableMarkets.map(market => {
            if (!market.associated_leads_table) {
              console.warn(`Skipping market ${market.name} in 'All Markets' fetch due to missing associated_leads_table.`);
              return Promise.resolve({ data: [], error: null }); // Return a resolved promise with empty data
            }
            return supabase
              .from(market.associated_leads_table) // Use the exact table name
              .select('*');
          })
        );
        
        // Combine results, filtering out any null/error responses if necessary (though Promise.resolve handles errors gracefully for flatMap)
        result = allResponses.reduce((acc, res) => {
          if (res.error) {
            console.error(`Error fetching data for a market during 'All Markets' fetch:`, res.error);
            // Optionally, collect these errors to display a partial error message
          }
          if (res.data) {
            acc.push(...res.data);
          }
          return acc;
        }, [] as CrmLead[]);

      } else {
        // Fetch specific market data
        const selectedMarket = availableMarkets.find(market => market.name === marketFilter);

        if (selectedMarket && selectedMarket.associated_leads_table) {
          const { data, error } = await supabase
            .from(selectedMarket.associated_leads_table) // Use the exact table name
            .select('*');
          
          if (error) throw error;
          result = data;
        } else {
          console.error(`Market details or associated_leads_table not found for: ${marketFilter}`);
          result = []; // Set to empty array if market details are not found
        }
      }
      
      setLeads(result || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsLoading(false);
    }
  }, [marketFilter, availableMarkets]);

  useEffect(() => {
    fetchMarketRegions();
  }, [fetchMarketRegions]);

  useEffect(() => {
    if (availableMarkets.length) {
      fetchLeads();
    }
  }, [marketFilter, availableMarkets, fetchLeads]);

  return (
    <div className="w-full h-full">
      <OmegaTable 
        data={leads.map(lead => ({
          ...lead,
          id: lead.id.toString()
        }))}
        loading={isLoading}
        error={error}
        marketFilter={marketFilter}
        availableMarkets={availableMarkets}
        onMarketFilterChange={setMarketFilter}
      />
    </div>
  );
}