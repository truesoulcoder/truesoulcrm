// src/components/views/CrmView.tsx
'use client';

// External dependencies
import { ChevronUp, ChevronDown, PlusCircle, Search } from 'lucide-react';
import { useState, useEffect, useRef, useCallback, useMemo } from 'react'; 
import { toast } from 'react-hot-toast';

// Internal components
import { createCrmLeadAction, updateCrmLeadAction, deleteCrmLeadAction } from '@/app/crm/actions';
import { LeadFormModal } from '@/components/leads/LeadFormModal';
import { useGoogleMapsApi } from '@/components/maps/GoogleMapsLoader';
// Utilities and types
import { supabase } from '@/lib/supabase/client';

import type { CrmLead } from '@/types/crm';

// Actions

interface ColumnConfig {
  key: keyof CrmLead | string;
  label: string;
  sortable?: boolean;
}

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

const CrmViewInner: React.FC = () => {
  // ...existing state and hooks

  // Handler to process geocode results and update form fields
  const handleGeocodeResult = (results: google.maps.GeocoderResult[] | null, status: google.maps.GeocoderStatus) => {
    if (status === 'OK' && results && results[0]) {
      const formattedAddress = results[0].formatted_address;
      setEditFormData(prev => ({
        ...prev,
        property_address: formattedAddress
      }));
      if (results[0].address_components) {
        let city = '';
        let state = '';
        let postalCode = '';
        for (const component of results[0].address_components) {
          const types = component.types;
          if (types.includes('locality')) {
            city = component.long_name;
          } else if (types.includes('administrative_area_level_1')) {
            state = component.short_name;
          } else if (types.includes('postal_code')) {
            postalCode = component.long_name;
          }
        }
        setEditFormData(prev => ({
          ...prev,
          property_city: city,
          property_state: state,
          property_postal_code: postalCode
        }));
      }
      // Set panorama position if available
      if (results[0].geometry && results[0].geometry.location) {
        setPanoramaPosition({ lat: results[0].geometry.location.lat(), lng: results[0].geometry.location.lng() });
      }
    }
  };

  const [leads, setLeads] = useState<CrmLead[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editFormData, setEditFormData] = useState<CrmFormData>({});
  const [isSaving, setIsSaving] = useState(false);

  const [searchTerm, setSearchTerm] = useState('');
  const [sortConfig, setSortConfig] = useState<{ key: keyof CrmLead | string; direction: 'ascending' | 'descending' } | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [marketFilter, setMarketFilter] = useState<string>('');
  const [availableMarkets, setAvailableMarkets] = useState<string[]>([]);

const convertNumericFieldsToStrings = (data: Record<string, any>): Record<string, any> => {
  // Don't convert to strings, just return the data as is
  return { ...data };
};

  // Fetch market regions from Supabase on mount
  useEffect(() => {
    const fetchMarketRegions = async () => {
      const { data, error } = await supabase
        .from('market_regions')
        .select('id')
        .order('id', { ascending: true });
      if (error) {
        console.error('Failed to fetch market regions:', error);
        setAvailableMarkets([]);
      } else if (data) {
        setAvailableMarkets(data.map((region: { id: string }) => region.id));
      }
    };
    void fetchMarketRegions();
  }, []);

  const [panoramaPosition, setPanoramaPosition] = useState<{ lat: number; lng: number } | null>(null);
  const [panoramaPov, setPanoramaPov] = useState<google.maps.StreetViewPov>({ heading: 34, pitch: 10 });

  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);
  const [modalTitleAddress, setModalTitleAddress] = useState<string>('');

  const columnConfigurations: ColumnConfig[] = [
    { key: 'contact_name', label: 'Contact Name', sortable: true },
    { key: 'contact_email', label: 'Email', sortable: true },
    { key: 'property_address', label: 'Property Address', sortable: true },
    { key: 'market_region', label: 'Market', sortable: true },
    { key: 'status', label: 'Status', sortable: true },
    { key: 'created_at', label: 'Date Added', sortable: true },
  ];

  const { isLoaded, loadError } = useGoogleMapsApi(); // Use the context hook

  // Memoize Autocomplete options for stability
  const autocompleteOptions = useMemo(() => ({
    types: ['address'] as const,
    componentRestrictions: { country: 'us' },
    fields: ['address_components', 'formatted_address', 'geometry', 'name', 'place_id', 'type'],
  }), []);

  const initialEditFormData: CrmFormData = {
    contact_name: '',
    contact_email: '',
    contact_phone: '',
    property_address: '',
    property_city: '',
    property_state: '',
    property_postal_code: '',
    property_type: '',
    beds: null, // Initialize as empty string
    baths: null, // Initialize as empty string
    year_built: null,
    square_footage: undefined,
    assessed_total: undefined,
    lot_size_sqft: undefined,
    notes: '',
    converted: false,
    mls_curr_status: '',
    mls_curr_days_on_market: '',
    status: 'Active',
  };

  const handleOpenModal = (lead?: CrmLead, normalizedLeadId?: number) => {
    if (lead) {
      let firstName = '';
      let lastName = '';
      if (lead.contact_name) {
        const nameParts = lead.contact_name.trim().split(' ');
        firstName = nameParts[0] || '';
        lastName = nameParts.slice(1).join(' ') || '';
      }
      const formData: CrmFormData = {
        // Spread all properties from lead first
        id: lead.id,
        contact_name: lead.contact_name || '',
        contact_email: lead.contact_email || '',
        contact_phone: lead.contact_phone || '',
        market_region: lead.market_region || '',
        property_address: lead.property_address || '',
        property_city: lead.property_city || '',
        property_state: lead.property_state || '',
        property_postal_code: lead.property_postal_code || '',
        property_type: lead.property_type || '',
        beds: lead.beds === null ? null : Number(lead.beds), // Convert to string for form
        baths: lead.baths === null ? null : Number(lead.baths), // Convert to string for form
        year_built: lead.year_built === null ? null : Number(lead.year_built), // Convert to string for form
        square_footage: lead.square_footage === null ? null : Number(lead.square_footage), // Convert to string for form
        lot_size_sqft: lead.lot_size_sqft === null ? null : Number(lead.lot_size_sqft), // Convert to string for form
        assessed_total: lead.assessed_total === null ? undefined : lead.assessed_total,
        mls_curr_status: lead.mls_curr_status || '',
        mls_curr_days_on_market: lead.mls_curr_days_on_market || '',
        converted: lead.converted || false,
        status: lead.status || '',
        notes: lead.notes || '',
        // Then set the split names
      };
      setEditFormData(formData);
      const addressDisplayParts = [];
      if (lead.property_address && lead.property_address.trim()) {
        addressDisplayParts.push(lead.property_address.trim());
      }
      if (lead.property_city && lead.property_city.trim()) {
        addressDisplayParts.push(lead.property_city.trim());
      }
      if (lead.property_state && lead.property_state.trim()) {
        addressDisplayParts.push(lead.property_state.trim());
      }

      let constructedTitleAddress = addressDisplayParts.join(', ');

      if (lead.property_postal_code && lead.property_postal_code.trim()) {
        const trimmedPostalCode = lead.property_postal_code.trim();
        if (constructedTitleAddress) {
          constructedTitleAddress = `${constructedTitleAddress} ${trimmedPostalCode}`;
        } else {
          constructedTitleAddress = trimmedPostalCode;
        }
      }
      const titleAddr = constructedTitleAddress;
      setModalTitleAddress(titleAddr);

      if (lead.property_address && isLoaded && window.google && window.google.maps && window.google.maps.Geocoder) {
        const geocoder = new window.google.maps.Geocoder();
        const fullAddress = `${lead.property_address}, ${lead.property_city}, ${lead.property_state} ${lead.property_postal_code}`;
        void geocoder.geocode({ address: fullAddress }, (results, status) => {
          if (status === 'OK' && results && results[0] && results[0].geometry && results[0].geometry.location) {
            setPanoramaPosition({ lat: results[0].geometry.location.lat(), lng: results[0].geometry.location.lng() });
          } else {
            console.warn(`Geocode was not successful for existing lead: ${status}`);
            setPanoramaPosition(null);
          }
        }).catch(error => {
          console.error('Error in geocode Promise:', error);
          setPanoramaPosition(null); // Ensure panorama is cleared on such errors
        });
      } else {
        if (!isLoaded) console.warn('Google Maps API not loaded. Cannot fetch panorama.');
        setPanoramaPosition(null);
      }
    } else {
      setEditFormData({
        ...initialEditFormData,
      });
      setModalTitleAddress('Add New Lead');
      setPanoramaPosition(null);
    }
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditFormData({}); 
    setModalTitleAddress('');
    setPanoramaPosition(null);
    if (autocompleteRef.current) { // Defensive clear
        // It's good practice to clear, but Google's Autocomplete might not have a formal "destroy" or "unbind" method here.
        // Setting ref to null is the main thing.
    }
    autocompleteRef.current = null; 
  };

  const handleSaveLead = async (leadData: CrmFormData) => {
    setIsSaving(true);
    setError(null);
  
    try {
      // Create a new object with the correct types for the database
      const leadToSave: Record<string, any> = {
        ...leadData,  // Use the leadData from the form
        // Convert string values to numbers where needed
        beds: leadData.beds ? String(leadData.beds) : null,
        baths: leadData.baths ? String(leadData.baths) : null,
        square_footage: leadData.square_footage || null,
        assessed_total: leadData.assessed_total || null,
        avm_value: leadData.avm_value || null,
        wholesale_value: leadData.wholesale_value || null,
        price_per_sq_ft: leadData.price_per_sq_ft || null,
        lot_size_sqft: leadData.lot_size_sqft || null,
        year_built: leadData.year_built || null,
        mls_curr_days_on_market: leadData.mls_curr_days_on_market || null,
        status: leadData.status || 'New',
        converted: leadData.converted || false
      };
  
      const result = leadData.id
        ? await updateCrmLeadAction(leadData.id, leadToSave)
        : await createCrmLeadAction(leadToSave);
  
      if (result.success) {
        toast.success('Lead saved successfully!');
        handleCloseModal();
        await fetchLeads();
      } else {
        let errorMessage = 'Failed to save lead.'; // Default error message
        const errorPayload: unknown = result.error;

        if (errorPayload) {
          if (errorPayload instanceof Error) {
            errorMessage = errorPayload.message;
          } else if (typeof errorPayload === 'string') {
            errorMessage = errorPayload;
          } else if (typeof errorPayload === 'object' && errorPayload !== null) {
            // Check for a 'message' property in the object
            if ('message' in errorPayload && typeof (errorPayload as { message?: unknown }).message === 'string') {
              errorMessage = (errorPayload as { message: string }).message;
            } else {
              console.error('Unhandled object error type from action:', errorPayload);
              errorMessage = 'An error object without a clear message was returned.';
            }
          } else {
            // Handle other truthy primitive types (e.g., number, boolean true)
            console.error('Unhandled primitive error type from action:', String(errorPayload));
            errorMessage = `An unexpected error value was returned: ${String(errorPayload)}`;
          }
        }
        setError(errorMessage);
        const messagePrefix = "Failed to save lead: ";
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call -- errorMessage is confirmed string by prior checks
        const confirmedErrorMessage: string = errorMessage as string; // Intermediate const
        const fullMessageString: string = messagePrefix + confirmedErrorMessage;
        toast.error(fullMessageString);
      }
    } catch (e: unknown) { // Catch block with typed error
      const caughtErrorMessage = 'An unexpected error occurred while saving the lead.'; // Changed to const
      if (e instanceof Error) {
        console.error('Error saving lead:', e.message, e.stack);
        // Optionally, use e.message for setError if more specific info is desired for UI
        // caughtErrorMessage = e.message;
      } else if (typeof e === 'string') {
        console.error('Error saving lead (string):', e);
        // caughtErrorMessage = e;
      } else {
        console.error('Error saving lead (unknown type):', e);
      }
      setError(caughtErrorMessage); // Keep UI error generic for truly unexpected issues
      toast.error('Failed to save lead. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteLead = async (id: number) => {
    if (window.confirm('Are you sure you want to delete this lead?')) {
      setIsLoading(true);
      const result = await deleteCrmLeadAction(id);
      if (result.success) {
        toast.success('Lead deleted successfully!');
        await fetchLeads();
      } else {
        toast.error(`Failed to delete lead: ${result.error}`);
      }
      setIsLoading(false);
    }
  };
  
  const handleDeleteLeadModal = async () => {
    if (!editFormData.id) return;
    if (!confirm('Are you sure you want to delete this lead? This action cannot be undone.')) return;

    setIsSaving(true); 
    setError(null);
    try {
      const result = await deleteCrmLeadAction(editFormData.id);
      if (result.error) throw new Error(result.error);
      setLeads(leads.filter(l => l.id !== editFormData.id));
      handleCloseModal();
    } catch (e: any) {
      console.error('Error deleting lead:', e);
      setError(`Failed to delete lead: ${e.message}`);
    }
    setIsSaving(false);
  };

  const onLoadStreetViewAutocomplete = useCallback((autocompleteInstance: google.maps.places.Autocomplete) => {
    console.log('[DEBUG] Autocomplete onLoadStreetViewAutocomplete called. Instance:', autocompleteInstance);
    autocompleteRef.current = autocompleteInstance;
  }, []);

  const onPlaceChangedStreetView = useCallback(() => {
    console.log('[DEBUG] onPlaceChangedStreetView triggered. autocompleteRef.current:', autocompleteRef.current);
    if (autocompleteRef.current) {
      const place = autocompleteRef.current.getPlace();
      console.log('[DEBUG] Place details from getPlace():', place);

      if (place && place.geometry && place.geometry.location && place.address_components) {
        const streetNumber = place.address_components.find(c => c.types.includes('street_number'))?.long_name || '';
        const route = place.address_components.find(c => c.types.includes('route'))?.long_name || '';
        const city = place.address_components.find(c => c.types.includes('locality'))?.long_name ||
                     place.address_components.find(c => c.types.includes('postal_town'))?.long_name || '';
        const state = place.address_components.find(c => c.types.includes('administrative_area_level_1'))?.short_name || '';
        const zip = place.address_components.find(c => c.types.includes('postal_code'))?.long_name || '';
        const fullAddress = `${streetNumber} ${route}`.trim();

        setEditFormData(prev => ({
          ...prev,
          property_address: fullAddress,
          property_city: city,
          property_state: state,
          property_postal_code: zip,
          // contact_first_name: prev.contact_first_name, // Ensure other fields are not lost
          // contact_last_name: prev.contact_last_name,
          // email: prev.email,
          // phone: prev.phone,
          // appraised_value: prev.appraised_value,
          // beds: prev.beds,
          // baths: prev.baths,
          // sq_ft: prev.sq_ft,
          // notes: prev.notes,
        }));
        setModalTitleAddress(place.formatted_address || fullAddress);
        setPanoramaPosition({ lat: place.geometry.location.lat(), lng: place.geometry.location.lng() });
      } else {
        console.warn('[DEBUG] Autocomplete: No place selected or place details (geometry/location/address_components) missing after getPlace(). Place:', place);
      }
    } else {
      console.warn('[DEBUG] onPlaceChangedStreetView: autocompleteRef.current is null.');
    }
  }, [setEditFormData, setModalTitleAddress, setPanoramaPosition]); // Dependencies kept as per your last successful structure

  const columns: ColumnConfig[] = [
    { key: 'contact_name', label: 'Contact Name', sortable: true },
    { key: 'email', label: 'Email', sortable: true },
    { key: 'phone', label: 'Phone', sortable: true },
    { key: 'status', label: 'Status', sortable: true },
    { key: 'property_address', label: 'Property Address', sortable: true },
    { key: 'property_city', label: 'City', sortable: true },
    { key: 'assessed_total', label: 'Assessed Value', sortable: true },
    { key: 'market_region', label: 'Market', sortable: true }
  ];

  const fetchLeads = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const { data, error } = await supabase
        .from('crm_leads')
        .select('*')
        .order(sortConfig?.key || 'created_at', { ascending: sortConfig?.direction === 'ascending' })
        .range((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage - 1);

      if (error) throw error;
      setLeads(data || []);
    } catch (err: any) {
      console.error('Error fetching leads:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch leads');
    } finally {
      setIsLoading(false);
    }
  }, [currentPage, rowsPerPage, sortConfig]);

  useEffect(() => {
    void fetchLeads();
  }, [fetchLeads]);

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(e.target.value);
    setCurrentPage(1); // Reset to first page on new search
  };

  const handleMarketFilterChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setMarketFilter(e.target.value);
    setCurrentPage(1); // Reset to first page on new filter
  };

  const handleSort = (key: keyof CrmLead | string) => {
    let direction: 'ascending' | 'descending' = 'ascending';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'ascending') {
      direction = 'descending';
    }
    setSortConfig({ key, direction });
  };

  const handlePageChange = (newPage: number) => {
    setCurrentPage(newPage);
  };

  const handleRowsPerPageChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newRowsPerPage = Number(e.target.value);
    setRowsPerPage(newRowsPerPage);
    setCurrentPage(1); // Reset to first page when changing rows per page
  };

  const handleModalInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setEditFormData(prev => ({
      ...prev,
      [name]: value,
    }));
  };

  const totalPages = Math.ceil(leads.length / rowsPerPage); // This might be incorrect if total count isn't fetched
                                                           // For client-side pagination after full fetch, this is fine.
                                                           // If using server-side pagination with limited fetches, need total count from server.

  // For client-side pagination and sorting after fetching all (or filtered) leads
  const sortedLeads = useMemo(() => {
    const sortableLeads = [...leads];
    if (sortConfig !== null) {
      sortableLeads.sort((a, b) => {
        const aValue = a[sortConfig.key as keyof CrmLead] ?? '';
        const bValue = b[sortConfig.key as keyof CrmLead] ?? '';
        if (aValue < bValue) {
          return sortConfig.direction === 'ascending' ? -1 : 1;
        }
        if (aValue > bValue) {
          return sortConfig.direction === 'ascending' ? 1 : -1;
        }
        return 0;
      });
    }
    return sortableLeads;
  }, [leads, sortConfig]);

  const paginatedLeads = useMemo(() => {
    return sortedLeads.slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage);
  }, [sortedLeads, currentPage, rowsPerPage]);

  return (
    <div className="relative z-10 p-4 md:p-6 lg:p-8 min-h-screen backdrop-blur-sm">
      <h1 className="text-2xl font-semibold mb-6">CRM Leads Management</h1>

      {/* Controls: Search, Filter, Add New */}
      <div className="mb-6 grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
        {/* Search Input */}
        <div className="form-control">
          <label className="label"><span className="label-text">Search Leads</span></label>
          <div className="relative">
            <input
              type="text"
              placeholder="Search by name, email, address..."
              className="input input-bordered w-full"
              value={searchTerm}
              onChange={handleSearchChange} />
            <span className="absolute inset-y-0 right-0 flex items-center pr-3">
              <Search className="h-5 w-5 text-gray-400" />
            </span>
          </div>
        </div>

        {/* Market Region Filter */}
        <div className="form-control">
          <label className="label"><span className="label-text">Filter by Market</span></label>
          <select
            className="select select-bordered w-full"
            value={marketFilter}
            onChange={handleMarketFilterChange}
          >
            <option value="">All Markets</option> {/* Assuming empty string for 'All' to match marketFilter initial state '' */}
            {availableMarkets.map((region: string) => (
              <option key={region} value={region}>
                {region}
              </option>
            ))}
          </select>
        </div>

        {/* Add New Lead Button */}
        <div className="form-control">
          <button
            className="btn btn-primary w-full md:w-auto md:justify-self-end"
            onClick={() => handleOpenModal()}
          >
            <PlusCircle className="mr-2 h-5 w-5" />
            Add New Lead
          </button>
        </div>
      </div>
      {/* Leads Table */}
      <div className="overflow-x-auto bg-base-100 shadow-lg rounded-lg mt-6">
        <table className="table table-zebra w-full">
          <thead>
            <tr>
              {columnConfigurations.map((col) => (
                <th
                  key={col.key}
                  className={`px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider ${col.sortable ? 'cursor-pointer hover:bg-base-200' : ''}`}
                  onClick={() => col.sortable && handleSort(col.key)}
                >
                  {col.label}
                  {col.sortable && sortConfig && sortConfig.key === col.key && (
                    sortConfig.direction === 'ascending' ? <ChevronUp className="inline w-4 h-4 ml-1" /> : <ChevronDown className="inline w-4 h-4 ml-1" />
                  )}
                  {col.sortable && (!sortConfig || sortConfig.key !== col.key) && (
                    <ChevronDown className="inline w-4 h-4 ml-1 text-gray-300" />
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr><td colSpan={columnConfigurations.length} className="text-center p-4"><span className="loading loading-spinner"></span> Loading leads...</td></tr>
            )}
            {!isLoading && error && (
              <tr><td colSpan={columnConfigurations.length} className="text-center p-4 text-error">{error}</td></tr>
            )}
            {!isLoading && !error && leads.length === 0 && (
              <tr><td colSpan={columnConfigurations.length} className="text-center p-4">No leads found. Adjust filters or add new leads.</td></tr>
            )}
            {!isLoading && !error && leads.map((lead) => (
              <tr key={lead.id} className="hover:bg-base-200 cursor-pointer" onClick={() => handleOpenModal(lead)}>
                {columnConfigurations.map(col => (
                  <td key={`${lead.id}-${col.key}`} className="px-4 py-3 whitespace-nowrap text-sm">
                    {col.key === 'created_at' || col.key === 'updated_at'
                      ? new Date(lead[col.key as keyof CrmLead] as string).toLocaleDateString()
                      : String(lead[col.key as keyof CrmLead] ?? '')}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination Controls */}
      {!isLoading && !error && (leads.length > 0 || currentPage > 1) && (
        <div className="mt-6 flex flex-col md:flex-row justify-between items-center space-y-4 md:space-y-0">
          <div className="flex items-center space-x-2">
            <span className="text-sm text-gray-700">Rows per page:</span>
            <select
              value={rowsPerPage}
              onChange={handleRowsPerPageChange}
              className="select select-bordered select-sm"
              disabled={isLoading}
            >
              {[10, 25, 50, 100].map(size => (
                <option key={size} value={size}>{size}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center space-x-2">
            <span className="text-sm text-gray-700">
              Page {currentPage}
            </span>
            <div className="join">
              <button
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={currentPage === 1 || isLoading}
                className="join-item btn btn-sm btn-outline"
              >
                Prev
              </button>
              <button
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={leads.length < rowsPerPage || isLoading}
                className="join-item btn btn-sm btn-outline"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal for Adding/Editing Leads */}
      <LeadFormModal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        onSubmit={(leadData) => {
          handleSaveLead(leadData).catch((error) => {
            console.error('Error submitting form:', error);
          });
        }}
        lead={convertNumericFieldsToStrings(editFormData)}
        isLoaded={isLoaded}
        isEditMode={!!editFormData.id}
        modalTitleAddress={modalTitleAddress}
        panoramaPosition={panoramaPosition}
        lat={panoramaPosition?.lat}
      />
    </div>
  );
}

export default function CrmView() {
  return (
      <CrmViewInner />
  );
}