// External dependencies
import { MapPin, X } from 'lucide-react';
import { useState, useEffect, useCallback, ChangeEvent, useRef } from 'react';
 
import { useGoogleMapsApi } from '@/components/maps/GoogleMapsLoader';
import { Database } from '@/db_types';

interface LeadFormModalProps {
  lead?: Partial<Database['public']['Tables']['crm_leads']['Row']>;
  onClose: () => void;
  onSubmit: (lead: Omit<Partial<Database['public']['Tables']['crm_leads']['Insert']>, 'baths'|'beds'|'assessed_total'|'year_built'|'lot_size_sqft'|'square_footage'> & {
    baths?: number | null;
    beds?: number | null;
    assessed_total?: number | null;
    year_built?: number | null;
    lot_size_sqft?: number | null;
    square_footage?: number | null;
  }) => void;
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
  contact_name: string;
  contact_email: string;
  contact_type: string;
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
}

const LeadFormModal = ({ 
  lead = {}, 
  onClose,
  onSubmit,
  isOpen,
  isLoaded,
}: LeadFormModalProps) => {
  const { isLoaded: mapsLoaded, loadError } = useGoogleMapsApi();
  const [streetViewLoaded, setStreetViewLoaded] = useState(false);
  const [panoramaPosition, setPanoramaPosition] = useState<{ lat: number; lng: number } | null>(null);
  const [formData, setFormData] = useState<LeadFormData>({
    contact_name: lead.contact_name ?? '',
    contact_email: lead.contact_email ?? '',
    contact_type: lead.contact_type ?? '',
    contact_phone: lead.contact_phone ?? '',
    property_address: lead.property_address ?? '',
    property_city: lead.property_city ?? '',
    property_state: lead.property_state ?? '',
    property_postal_code: lead.property_postal_code ?? '',
    assessed_total: lead.assessed_total ? Number(lead.assessed_total) : null,
    property_type: lead.property_type ?? '',
    square_footage: lead.square_footage ? Number(lead.square_footage) : null,
    beds: lead.beds ? Number(lead.beds) : null,
    baths: lead.baths ? Number(lead.baths) : null,
    year_built: lead.year_built ? Number(lead.year_built) : null,
    lot_size_sqft: lead.lot_size_sqft ? Number(lead.lot_size_sqft) : null,
    notes: lead.notes ?? ''
  } as LeadFormData);

  const modalContentRef = useRef<HTMLDivElement>(null);

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
      void onSubmit({
        ...formData,
        assessed_total: formData.assessed_total,
        square_footage: formData.square_footage,
        beds: formData.beds,
        baths: formData.baths,
        year_built: formData.year_built,
        lot_size_sqft: formData.lot_size_sqft
      });
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
      <div ref={modalContentRef} className="modal-box w-11/12 max-w-4xl">
        <button 
          className="btn btn-sm btn-circle absolute right-2 top-2"
          onClick={onClose}
        >
          <X size={18} />
        </button>
        <h3 className="font-bold text-lg mb-4">{formData.property_address || (lead ? 'Edit Lead' : 'Add New Lead')}</h3>
        
        <form 
          onSubmit={(e) => {
            e.preventDefault();
            void handleSubmit(e);
          }}
          className="space-y-4"
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Contact Info */}
            <div>
              <label className="label"><span className="label-text">Contact Name</span></label>
              <input 
                type="text" 
                name="contact_name" 
                placeholder="Contact Name" 
                className={`input input-sm input-bordered w-full ${formData.contact_name ? 'input-success' : ''}`} 
                value={formData.contact_name || ''} 
                onChange={onInputChange} 
              />
            </div>
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
            <div>
              <label className="label"><span className="label-text">Contact Type</span></label>
              <input 
                type="text" 
                name="contact_type" 
                placeholder="Contact Type" 
                className={`input input-sm input-bordered w-full ${formData.contact_type ? 'input-success' : ''}`} 
                value={formData.contact_type || ''} 
                onChange={onInputChange} 
              />
            </div>
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
          </div>
          {/* Property Info */}
          <div className="divider">Property Information</div>
          <div className="space-y-4">
            <div className="relative">
              <label className="label"><span className="label-text">Property Address</span></label>
              <input 
                type="text" 
                name="property_address" 
                placeholder="Property Address" 
                className={`input input-sm input-bordered w-full pr-10 ${formData.property_address ? 'input-success' : ''}`} 
                value={formData.property_address || ''} 
                onChange={onInputChange} 
              />
              <button 
                type="button"
                className="absolute right-2 top-10 transform -translate-y-1/2 text-gray-500 hover:text-primary"
                onClick={onGeocode}
                disabled={!formData.property_address || !isLoaded}
              >
                <MapPin size={18} />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
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
              <div>
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
              <div>
                <label className="label"><span className="label-text">Postal Code</span></label>
                <input 
                  type="text" 
                  name="property_postal_code" 
                  placeholder="Postal Code" 
                  className={`input input-sm input-bordered w-full ${formData.property_postal_code ? 'input-success' : ''}`} 
                  value={formData.property_postal_code || ''} 
                  onChange={onInputChange} 
                />
              </div>
            </div>
            
            <div>
              <label className="label"><span className="label-text">Assessed Value</span></label>
              <input 
                type="number" 
                name="assessed_total" 
                placeholder="e.g., 250000" 
                className={`input input-sm input-bordered w-full ${formData.assessed_total !== null ? 'input-success' : ''}`} 
                value={formData.assessed_total !== null ? formData.assessed_total.toString() : ''} 
                onChange={onInputChange} 
              />
            </div>

            <div>
              <label className="label"><span className="label-text">Property Type</span></label>
              <div className="flex items-center space-x-4">
                <label className="flex items-center cursor-pointer">
                  <input 
                    type="radio" 
                    name="property_type" 
                    className="radio radio-sm radio-primary" 
                    value="Single Family" 
                    checked={formData.property_type === 'Single Family'} 
                    onChange={onInputChange} 
                  />
                  <span className="ml-2">Single Family</span>
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
                  <span className="ml-2">Vacant Land</span>
                </label>
              </div>
            </div>

            {formData.property_type === 'Single Family' && (
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div>
                  <label className="label"><span className="label-text">Square Footage</span></label>
                  <input 
                    type="number" 
                    name="square_footage" 
                    placeholder="Square Footage" 
                    className={`input input-sm input-bordered w-full ${formData.square_footage !== null ? 'input-success' : ''}`} 
                    value={formData.square_footage !== null ? formData.square_footage.toString() : ''} 
                    onChange={onInputChange} 
                  />
                </div>
                <div>
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
                <div>
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
                <div>
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
              </div>
            )}

            {formData.property_type === 'Vacant Land' && (
              <div className="grid grid-cols-1 md:grid-cols-1 gap-4">
                <div>
                  <label className="label"><span className="label-text">Lot Size (sqft)</span></label>
                  <input 
                    type="number" 
                    name="lot_size_sqft" 
                    placeholder="Lot Size" 
                    className={`input input-sm input-bordered w-full ${formData.lot_size_sqft !== null ? 'input-success' : ''}`} 
                    value={formData.lot_size_sqft !== null ? formData.lot_size_sqft.toString() : ''} 
                    onChange={onInputChange} 
                  />
                </div>
              </div>
            )}

            <div>
              <label className="label"><span className="label-text">Notes</span></label>
              <textarea 
                name="notes" 
                placeholder="Additional notes..." 
                className={`textarea textarea-sm textarea-bordered w-full h-24 ${formData.notes ? 'textarea-success' : ''}`} 
                value={formData.notes || ''} 
                onChange={onInputChange} 
              />
            </div>
          </div>

          {/* StreetView Container */}
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

          <div className="modal-action">
            <button 
              type="button" 
              className="btn btn-ghost"
              onClick={onClose}
            >
              Cancel
            </button>
            <button 
              type="submit" 
              className="btn btn-primary"
            >
              {lead ? 'Update Lead' : 'Add Lead'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export { LeadFormModal };
