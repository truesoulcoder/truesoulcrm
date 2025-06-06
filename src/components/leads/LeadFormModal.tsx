// External dependencies
import { MapPin, X } from 'lucide-react';
import { useState, useEffect, useCallback, ChangeEvent, useRef } from 'react';
import { deleteCrmLeadAction } from '@/app/crm/actions'; // As requested, though onDelete prop handles the call
import { useGoogleMapsApi } from '@/components/maps/GoogleMapsLoader';
import { Database } from '@/db_types';

interface LeadFormModalProps {
  lead?: Partial<Database['public']['Tables']['crm_leads']['Row']>;
  onClose: () => void;
  onSubmit: (lead: LeadFormData) => void; // Updated onSubmit prop type
  onDelete?: (leadId: number | string) => Promise<void>; // Added onDelete prop
  isOpen: boolean;
  isLoaded: boolean;
  isEditMode?: boolean;
  modalTitleAddress?: string;
  panoramaPosition?: { lat: number; lng: number } | null;
  lat?: number;
  lng?: number;
  onInputChange?: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  onGeocode?: () => void;
}

interface LeadFormData {
  first_name: string; // Added
  last_name: string; // Added
  contact_email: string;
  contact_type: string; // Assuming this stays for now
  contact_phone: string;
  property_address: string;
  property_city: string;
  property_state: string;
  property_postal_code: string;
  assessed_total: number | null;
  property_type: string;
  square_footage: number | null;
  beds: number | null;
  baths: number | null;
  year_built: number | null;
  lot_size_sqft: number | null;
  notes: string;
  status: string; // Added
  street_address: string; // Added
}

const LeadFormModal = ({ 
  lead = {}, 
  onClose,
  onSubmit,
  isOpen,
  isLoaded,
  isEditMode, // Destructure isEditMode
  onDelete,   // Destructure onDelete
}: LeadFormModalProps) => {
  const { isLoaded: mapsLoaded, loadError } = useGoogleMapsApi();
  const [streetViewLoaded, setStreetViewLoaded] = useState(false);
  const [panoramaPosition, setPanoramaPosition] = useState<{ lat: number; lng: number } | null>(null);
  const [formData, setFormData] = useState<LeadFormData>({
    first_name: lead?.first_name ?? '', 
    last_name: lead?.last_name ?? '',  
    contact_email: lead?.contact_email ?? '',
    contact_type: lead?.contact_type ?? '', 
    contact_phone: lead?.contact_phone ?? '',
    property_address: lead?.property_address ?? '',
    property_city: lead?.property_city ?? '',
    property_state: lead?.property_state ?? '',
    property_postal_code: lead?.property_postal_code ?? '',
    assessed_total: lead?.assessed_total ? Number(lead.assessed_total) : null,
    property_type: lead?.property_type ?? '',
    square_footage: lead?.square_footage ? Number(lead.square_footage) : null,
    beds: lead?.beds ? Number(lead.beds) : null,
    baths: lead?.baths ? Number(lead.baths) : null,
    year_built: lead?.year_built ? Number(lead.year_built) : null,
    lot_size_sqft: lead?.lot_size_sqft ? Number(lead.lot_size_sqft) : null,
    notes: lead?.notes ?? '',
    status: lead?.status ?? '', 
    street_address: lead?.street_address ?? '', 
  } as LeadFormData);

  const modalContentRef = useRef<HTMLDivElement>(null);

  // Effect to reset formData when modal opens or lead prop changes
  useEffect(() => {
    if (isOpen) {
      setFormData({
        first_name: lead?.contact_name ?? '', // Map contact_name to first_name
        last_name: '', // Default last_name to blank
        contact_email: lead?.contact_email ?? '',
        contact_type: lead?.contact_type ?? '',
        contact_phone: lead?.contact_phone ?? '',
        property_address: lead?.property_address ?? '',
        property_city: lead?.property_city ?? '',
        property_state: lead?.property_state ?? '',
        property_postal_code: lead?.property_postal_code ?? '',
        assessed_total: lead?.assessed_total ? Number(lead.assessed_total) : null,
        property_type: lead?.property_type ?? '',
        square_footage: lead?.square_footage ? Number(lead.square_footage) : null,
        beds: lead?.beds ? Number(lead.beds) : null,
        baths: lead?.baths ? Number(lead.baths) : null,
        year_built: lead?.year_built ? Number(lead.year_built) : null,
        lot_size_sqft: lead?.lot_size_sqft ? Number(lead.lot_size_sqft) : null,
        notes: lead?.notes ?? '',
        status: lead?.status ?? '',
        street_address: lead?.street_address ?? '', // Will be '' if not on lead object
      });
    }
  }, [lead, isOpen, setFormData]); // setFormData is stable, but good practice to include

  const initStreetView = useCallback(async () => {
    if (!formData.property_address || !mapsLoaded || loadError) return;

    try {
      const geocoder = new google.maps.Geocoder();
      const response = await geocoder.geocode({ address: formData.property_address });
      
      if (response.results[0]) {
        const location = response.results[0].geometry.location;
        setPanoramaPosition({ 
          lat: location.lat(), 
          lng: location.lng() 
        });
        setStreetViewLoaded(true);
      }
    } catch (error: unknown) {
      if (error instanceof Error) {
        console.error('Error loading StreetView:', error.message);
      } else {
        console.error('Unknown error loading StreetView');
      }
    }
  }, [mapsLoaded, loadError, formData.property_address]);

  useEffect(() => {
    void initStreetView();
  }, [initStreetView]);

  useEffect(() => {
    const handleClickOutside = (event: globalThis.MouseEvent) => {
      if (modalContentRef.current && !modalContentRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    try {
      // Pass the entire formData, which now includes all new and existing fields
      // The numeric conversions are handled by onInputChange and types in LeadFormData
      void onSubmit(formData); 
    } catch (error) {
      console.error('Failed to submit lead:', error);
    }
  };

  const onInputChange = (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    
    // Safely update form data by checking if the field exists in our type
    if (name in formData) {
      if (['assessed_total', 'square_footage', 'beds', 'baths', 'year_built', 'lot_size_sqft'].includes(name)) {
        setFormData(prev => ({
          ...prev,
          [name as keyof LeadFormData]: value === '' ? null : Number(value)
        }));
      } else {
        setFormData(prev => ({
          ...prev,
          [name as keyof LeadFormData]: value
        }));
      }
    }
  };

  const onGeocode = () => {
    // implement onGeocode logic
  };

  return (
    <div className="modal modal-open">
      <div ref={modalContentRef} className="modal-box w-11/12 max-w-4xl bg-base-200">
        <button 
          className="btn btn-sm btn-circle absolute right-2 top-2"
          onClick={onClose}
        >
          <X size={18} />
        </button>
        <h3 className="font-bold text-lg mb-4">
          {formData.property_address 
            ? `Property Location: ${formData.property_address}` 
            : (isEditMode ? 'Edit Lead' : 'Add New Lead')}
        </h3>

        {/* StreetView Container - Moved Here */}
        {streetViewLoaded && panoramaPosition && (
          <div className="mt-4 h-64 w-full">
            <div 
              id="street-view" 
              className="h-full w-full rounded-lg border border-gray-200"
              ref={(ref) => {
                if (ref && !ref.hasChildNodes() && panoramaPosition) {
                  new google.maps.StreetViewPanorama(ref, {
                    position: panoramaPosition,
                    pov: { heading: 165, pitch: 0 },
                    zoom: 1
                  });
                }
              }}
            />
          </div>
        )}
        
        <form 
          onSubmit={(e) => {
            e.preventDefault();
            void handleSubmit(e);
          }}
          className="space-y-4"
        >
          {/* CONTACT Section */}
          <div className="divider divider-start font-bold uppercase text-sm mt-6 mb-2">CONTACT</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-1">
            {/* First Name */}
            <div>
              <label className="label"><span className="label-text">First Name</span></label>
              <input 
                type="text" 
                name="first_name" 
                placeholder="First Name" 
                className={`input input-sm input-bordered w-full ${formData.first_name ? 'input-success' : ''}`} 
                value={formData.first_name} 
                onChange={onInputChange} 
              />
            </div>
            {/* Last Name */}
            <div>
              <label className="label"><span className="label-text">Last Name</span></label>
              <input 
                type="text" 
                name="last_name" 
                placeholder="Last Name" 
                className={`input input-sm input-bordered w-full ${formData.last_name ? 'input-success' : ''}`} 
                value={formData.last_name} 
                onChange={onInputChange} 
              />
            </div>
            {/* Contact Email */}
            <div>
              <label className="label"><span className="label-text">Contact Email</span></label>
              <input 
                type="email" 
                name="contact_email" 
                placeholder="Contact Email" 
                className={`input input-sm input-bordered w-full ${formData.contact_email ? 'input-success' : ''}`} 
                value={formData.contact_email || ''} 
                onChange={onInputChange} 
              />
            </div>
            {/* Contact Phone */}
            <div>
              <label className="label"><span className="label-text">Contact Phone</span></label>
              <input 
                type="tel" 
                name="contact_phone" 
                placeholder="Contact Phone" 
                className={`input input-sm input-bordered w-full ${formData.contact_phone ? 'input-success' : ''}`} 
                value={formData.contact_phone || ''} 
                onChange={onInputChange} 
              />
            </div>
            {/* Contact Type - Assuming this stays with contact info */}
             <div className="md:col-span-2"> {/* Spans two columns */}
              <label className="label"><span className="label-text">Contact Type</span></label>
              <input 
                type="text" 
                name="contact_type" 
                placeholder="Contact Type (e.g., Owner, Agent, Tenant)" 
                className={`input input-sm input-bordered w-full ${formData.contact_type ? 'input-success' : ''}`} 
                value={formData.contact_type || ''} 
                onChange={onInputChange} 
              />
            </div>
          </div>

          {/* LOCATION Section */}
          <div className="divider divider-start font-bold uppercase text-sm mt-6 mb-2">LOCATION</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-1"> 
            
            {/* Status Dropdown */}
            <div className="md:col-span-1"> {/* Each field takes one column on medium screens and above */}
              <label className="label"><span className="label-text">Status</span></label>
              <select
                name="status"
                className="select select-sm select-bordered w-full"
                value={formData.status}
                onChange={(e) => setFormData(prev => ({ ...prev, status: e.target.value }))}
              >
                <option value="">-- Select Status --</option>
                <option value="New">New</option>
                <option value="Qualified">Qualified</option>
                <option value="Unqualified">Unqualified</option>
              </select>
            </div>

            {/* Empty div for spacing, or another field can go here */}
            <div className="md:col-span-1"></div>

            {/* Full Property Address (Spans 2 columns) */}
            <div className="relative md:col-span-2">
              <label className="label"><span className="label-text">Full Property Address (Geocoding)</span></label>
              <input 
                type="text" 
                name="property_address" 
                placeholder="Enter full address for geocoding..." 
                className={`input input-sm input-bordered w-full pr-10 ${formData.property_address ? 'input-success' : ''}`} 
                value={formData.property_address || ''} 
                onChange={onInputChange} 
              />
              <button 
                type="button"
                className="absolute right-2 top-9 transform text-gray-500 hover:text-primary" // Adjusted top for input-sm
                onClick={onGeocode}
                disabled={!formData.property_address || !mapsLoaded} // mapsLoaded instead of isLoaded
              >
                <MapPin size={18} />
              </button>
            </div>

            {/* Street Address */}
            <div className="md:col-span-1">
              <label className="label"><span className="label-text">Street Address</span></label>
              <input 
                type="text" 
                name="street_address" 
                placeholder="Street Address" 
                className={`input input-sm input-bordered w-full ${formData.street_address ? 'input-success' : ''}`} 
                value={formData.street_address} 
                onChange={onInputChange} 
              />
            </div>

            {/* City */}
            <div className="md:col-span-1">
              <label className="label"><span className="label-text">City</span></label>
              <input 
                type="text" 
                name="property_city" 
                placeholder="City" 
                className={`input input-sm input-bordered w-full ${formData.property_city ? 'input-success' : ''}`} 
                value={formData.property_city || ''} 
                onChange={onInputChange} 
              />
            </div>

            {/* State */}
            <div className="md:col-span-1">
              <label className="label"><span className="label-text">State</span></label>
              <input 
                type="text" 
                name="property_state" 
                placeholder="State" 
                className={`input input-sm input-bordered w-full ${formData.property_state ? 'input-success' : ''}`} 
                value={formData.property_state || ''} 
                onChange={onInputChange} 
              />
            </div>

            {/* Zip */}
            <div className="md:col-span-1">
              <label className="label"><span className="label-text">Zip</span></label>
              <input 
                type="text" 
                name="property_postal_code" 
                placeholder="Zip Code" 
                className={`input input-sm input-bordered w-full ${formData.property_postal_code ? 'input-success' : ''}`} 
                value={formData.property_postal_code || ''} 
                onChange={onInputChange} 
              />
            </div>
            
            {/* Appraised Value */}
            <div className="md:col-span-1">
              <label className="label"><span className="label-text">Appraised Value</span></label>
              <input 
                type="number" 
                name="assessed_total" 
                placeholder="e.g., 250000" 
                className={`input input-sm input-bordered w-full ${formData.assessed_total !== null ? 'input-success' : ''}`} 
                value={formData.assessed_total !== null ? formData.assessed_total.toString() : ''} 
                onChange={onInputChange} 
              />
            </div>

            {/* Property Type (Spans 2 columns for better layout of radio buttons) */}
            <div className="md:col-span-2">
              <label className="label"><span className="label-text">Property Type</span></label>
              <div className="flex items-center space-x-4 mt-1">
                <label className="flex items-center cursor-pointer">
                  <input 
                    type="radio" 
                    name="property_type" 
                    className="radio radio-sm radio-primary" 
                    value="Single Family" 
                    checked={formData.property_type === 'Single Family'} 
                    onChange={onInputChange} 
                  />
                  <span className="label-text ml-2">Single Family</span>
                </label>
                <label className="flex items-center cursor-pointer">
                  <input 
                    type="radio" 
                    name="property_type" 
                    className="radio radio-sm radio-primary" 
                    value="Vacant Land" 
                    checked={formData.property_type === 'Vacant Land'} 
                    onChange={onInputChange} 
                  />
                  <span className="label-text ml-2">Vacant Land</span>
                </label>
              </div>
            </div>

            {/* Conditional Fields based on Property Type */}
            {formData.property_type === 'Single Family' && (
              <>
                <div className="md:col-span-1">
                  <label className="label"><span className="label-text">SQ FT</span></label>
                  <input 
                    type="number" 
                    name="square_footage" 
                    placeholder="SQ FT" 
                    className={`input input-sm input-bordered w-full ${formData.square_footage !== null ? 'input-success' : ''}`} 
                    value={formData.square_footage !== null ? formData.square_footage.toString() : ''} 
                    onChange={onInputChange} 
                  />
                </div>
                <div className="md:col-span-1">
                  <label className="label"><span className="label-text">Beds</span></label>
                  <input 
                    type="number" 
                    name="beds" 
                    placeholder="Beds" 
                    className={`input input-sm input-bordered w-full ${formData.beds !== null ? 'input-success' : ''}`} 
                    value={formData.beds !== null ? formData.beds.toString() : ''} 
                    onChange={onInputChange} 
                  />
                </div>
                <div className="md:col-span-1">
                  <label className="label"><span className="label-text">Baths</span></label>
                  <input 
                    type="number" 
                    name="baths" 
                    placeholder="Baths" 
                    className={`input input-sm input-bordered w-full ${formData.baths !== null ? 'input-success' : ''}`} 
                    value={formData.baths !== null ? formData.baths.toString() : ''} 
                    onChange={onInputChange} 
                  />
                </div>
                <div className="md:col-span-1">
                  <label className="label"><span className="label-text">Year Built</span></label>
                  <input 
                    type="number" 
                    name="year_built" 
                    placeholder="Year Built" 
                    className={`input input-sm input-bordered w-full ${formData.year_built !== null ? 'input-success' : ''}`} 
                    value={formData.year_built !== null ? formData.year_built.toString() : ''} 
                    onChange={onInputChange} 
                  />
                </div>
              </>
            )}

            {formData.property_type === 'Vacant Land' && (
              <div className="md:col-span-1"> {/* Spans 1, but could be 2 if preferred */}
                <label className="label"><span className="label-text">Lot Size (sqft)</span></label>
                <input 
                  type="number" 
                  name="lot_size_sqft" 
                  placeholder="Lot Size (sqft)" 
                  className={`input input-sm input-bordered w-full ${formData.lot_size_sqft !== null ? 'input-success' : ''}`} 
                  value={formData.lot_size_sqft !== null ? formData.lot_size_sqft.toString() : ''} 
                  onChange={onInputChange} 
                />
              </div>
            )}
             {/* Spacer to fill grid if lot_size_sqft is shown and beds/baths etc are not, to maintain layout consistency */}
            {formData.property_type === 'Vacant Land' && <div className="md:col-span-1"></div>}
            {formData.property_type === 'Vacant Land' && <div className="md:col-span-1"></div>}
            {formData.property_type === 'Vacant Land' && <div className="md:col-span-1"></div>}


            {/* End of Location Grid */}
          </div>

          {/* Notes (Full Width - Placed after Contact and Location sections) */}
          <div> {/* No col-span needed as it's outside the grid, will take full width of flex column */}
            <label className="label"><span className="label-text">Notes</span></label>
            <textarea 
              name="notes" 
              placeholder="Additional notes..." 
              className={`textarea textarea-sm textarea-bordered w-full h-24 ${formData.notes ? 'textarea-success' : ''}`} 
              value={formData.notes || ''} 
              onChange={onInputChange} 
            />
          </div>
          
          <div className="modal-action mt-6 grid grid-cols-3 gap-2 w-full items-center">
            <div className="justify-self-start">
              {isEditMode && onDelete && lead && lead.id && (
                <button
                  type="button"
                  className="btn btn-sm btn-secondary" // Changed style to btn-secondary and added btn-sm
                  onClick={async () => {
                    if (window.confirm('Are you sure you want to delete this lead?')) {
                      await onDelete(lead.id);
                    }
                  }}
                >
                  DELETE LEAD
                </button>
              )}
            </div>
            <div className="justify-self-center">
              <button 
                type="button" 
                className="btn btn-sm btn-ghost" // Added btn-sm
                onClick={onClose}
              >
                Cancel
              </button>
            </div>
            <div className="justify-self-end">
              <button 
                type="submit" 
                className="btn btn-sm btn-primary" // Added btn-sm
              >
                {isEditMode ? 'UPDATE LEAD' : 'ADD LEAD'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

export { LeadFormModal };
