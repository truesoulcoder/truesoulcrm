// src/components/crm/CrmTable.tsx
'use client';
// External dependencies
import { Table, flexRender } from '@tanstack/react-table';
import { ChevronUp, ChevronDown, Edit3, Trash2, PlusCircle, Search, AlertTriangle } from 'lucide-react';
import { useState, useEffect, useRef, useCallback, useMemo, ChangeEvent, FormEvent } from 'react'; 
import { Button, Card, Modal, Alert, Badge } from 'react-daisyui';
import { toast } from 'react-hot-toast';

// Re-export Lead and StatusOption if they are defined here and used by CrmView
// Otherwise, CrmView should import them from their original source (e.g., a types file)
export interface Lead {
  // Common fields
  id: string | number; // string for UUID (crm_leads), number for normalized_leads.id
  status: string;
  created_at?: string | Date;
  updated_at?: string | Date;
  notes?: string;
  market_region?: string;
  
  // Contact info (crm_leads)
  first_name?: string;
  last_name?: string;
  email?: string;
  phone?: string;
  company?: string;
  
  // Property info (both schemas, different field names)
  property_address_full?: string;
  property_address_street?: string; // crm_leads
  property_address_city?: string;   // crm_leads
  property_address_state?: string;  // crm_leads
  property_postal_code?: string;    // normalized_leads
  
  // Property details
  assessed_value?: number;         // crm_leads
  beds?: number | string;          // number in crm_leads, string in normalized_leads
  baths?: number | string;         // number in crm_leads, string in normalized_leads
  sq_ft?: number;                  // crm_leads
  square_footage?: string;         // normalized_leads
  
  // MLS info
  mls_curr_status?: string;
  mls_curr_days_on_market?: string;
  
  // For display purposes (computed)
  display_name?: string;
  display_address?: string;
}

export interface StatusOption { // This might not be needed in CrmTable if CrmView handles status display logic
  value: string;
  label: string;
  color: string;
}

export interface CrmTableProps {
  data: Lead[];
  isLoading: boolean;
  onRowUpdate: UpdateHandler;
}

interface UpdateHandler {
  (updatedLead: Lead): Promise<void>;
}

const CrmTable: React.FC<CrmTableProps> = ({
  data,
  isLoading,
  onRowUpdate,
}) => {
  const [autocompleteInstance, setAutocompleteInstance] = useState<google.maps.places.Autocomplete | null>(null);

  const getFullAddress = (lead: Lead) => {
    return [
      lead.property_address_street,
      lead.property_address_city,
      lead.property_address_state,
      lead.property_postal_code
    ].filter(Boolean).join(', ');
  };

  const onLoadAutocomplete = (autocomplete: google.maps.places.Autocomplete) => {
    setAutocompleteInstance(autocomplete);
  };

  const onPlaceChanged = () => {
    if (autocompleteInstance) {
      const place = autocompleteInstance.getPlace();
      if (place.address_components) {
        const getAddressComponent = (type: string, useShortName: boolean = false) => {
          const component = place.address_components?.find(c => c.types.includes(type));
          return component ? (useShortName ? component.short_name : component.long_name) : '';
        };

        const street_number = getAddressComponent('street_number');
        const route = getAddressComponent('route');
        const locality = getAddressComponent('locality'); // city
        const administrative_area_level_1 = getAddressComponent('administrative_area_level_1', true); // state (short)
        const postal_code = getAddressComponent('postal_code');
        // const country = getAddressComponent('country', true); // country (short)

        const streetAddress = `${street_number} ${route}`.trim();
        const fullAddress = place.formatted_address || '';

        // setFormData((prev: Partial<Lead>) => ({
        //   ...prev,
        //   property_address_street: streetAddress,
        //   property_address_city: locality,
        //   property_address_state: administrative_area_level_1,
        //   property_address_zip: postal_code,
        //   property_address_full: fullAddress,
        // }));
      } else if (place.formatted_address) {
        // setFormData((prev: Partial<Lead>) => ({
        //     ...prev,
        //     property_address_full: place.formatted_address,
        //     property_address_street: '',
        //     property_address_city: '',
        //     property_address_state: '',
        //     property_address_zip: '',
        //  }));
      }
    } else {
      console.log('Autocomplete is not loaded yet!');
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center p-10">
        <span className="loading loading-lg loading-spinner text-primary"></span>
      </div>
    );
  }

  return (
    <div className="crm-table-container">
      <div className="overflow-x-auto bg-base-100 rounded-lg shadow">
        <table className="table table-zebra w-full">
          <thead>
            <tr className="bg-base-300">
              <th className="p-3 cursor-pointer select-none">First Name</th>
              <th className="p-3 cursor-pointer select-none">Last Name</th>
              <th className="p-3 cursor-pointer select-none">Email</th>
              <th className="p-3 cursor-pointer select-none">Phone</th>
              <th className="p-3 cursor-pointer select-none">Property Address</th>
              <th className="p-3 cursor-pointer select-none">Status</th>
            </tr>
          </thead>
          <tbody>
            {data.map((lead, index) => (
              <tr 
                key={index} 
                className="hover:bg-base-200 cursor-pointer" 
                onClick={() => void onRowUpdate(lead)}
              >
                <td className="p-3 border-b border-base-300 text-sm">{lead.first_name}</td>
                <td className="p-3 border-b border-base-300 text-sm">{lead.last_name}</td>
                <td className="p-3 border-b border-base-300 text-sm">{lead.email}</td>
                <td className="p-3 border-b border-base-300 text-sm">{lead.phone}</td>
                <td className="p-3 border-b border-base-300 text-sm">{getFullAddress(lead)}</td>
                <td className="p-3 border-b border-base-300 text-sm">{lead.status}</td>
              </tr>
            ))}
            {data.length === 0 && (
              <tr>
                <td colSpan={6} className="text-center p-4">
                  No leads found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default CrmTable;