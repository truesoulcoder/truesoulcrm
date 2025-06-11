'use client';

import { useState, useEffect, FormEvent, ChangeEvent } from 'react';
import { supabase } from '@/lib/supabase/client';
import { X, MapPin } from 'lucide-react'; // Keep X for close, MapPin for title
import StreetViewMap from '@/components/maps/StreetViewMap';
import { updatePropertyAction, deletePropertyAction } from '@/app/crm/actions';
import { type Database, Tables, Enums } from '@/types/supabase';
import { Modal } from '@/components/ui/modal'; // This is the custom Modal wrapper
import { formatAddress } from '@/utils/address';
import { 
    Button, 
    Spinner, 
    Input as HeroInput, // Renamed to avoid conflict with HTMLInputElement if any
    Select as HeroSelect, 
    SelectItem, 
    Textarea as HeroTextarea,
    Accordion,
    AccordionItem,
    // Card, // If needed for map container, but div with Tailwind is also fine
} from '@heroui/react';

// Define shorter types
type Property = Tables<'properties'>;
type Contact = Tables<'contacts'>;
type LeadStatus = Enums<'lead_status'>;

const leadStatusOptions: LeadStatus[] = [
    "New Lead", "Attempted to Contact", "Contacted", "Working/In Progress",
    "Contract Sent", "Qualified", "Unqualified/Disqualified", "Nurture",
    "Meeting Set", "Closed - Converted/Customer", "Closed - Not Converted/Opportunity Lost",
];

interface LeadFormModalProps {
  property?: Property;
  isOpen: boolean;
  onClose: () => void;
}

// A generic form input component refactored for HeroUI
const FormInput = ({ label, name, value, onChange, placeholder = '', type = 'text', className = '', ...props }: any) => (
    <HeroInput
        type={type}
        name={name}
        label={label} // HeroUI Input likely takes label as a prop
        value={value || ''}
        onChange={onChange}
        placeholder={placeholder}
        className={`w-full ${className}`} // Ensure it takes full width within its container
        size="sm" // Assuming HeroUI has size prop, similar to input-sm
        {...props}
    />
);

const LeadFormModal = ({ property, isOpen, onClose }: LeadFormModalProps) => {
  const [formData, setFormData] = useState<any>({ contacts: [] });
  const [isLoading, setIsLoading] = useState(true); // For initial data loading
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) { // Reset on close or if property is not set initially
        setIsLoading(false);
        setFormData({ contacts: [] }); // Reset form data
        setError(null);
        return;
    }
    if (!property && isOpen) { // If opened for new lead (no property)
        setIsLoading(false);
        setFormData({ status: 'New Lead', contacts: [] }); // Default status
        return;
    }
    if (!property) return;


    const fetchAndSetData = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const { data: contactData, error: fetchError } = await supabase.from('contacts').select('*').eq('property_id', property.property_id);
        if (fetchError) throw fetchError;

        setFormData({
            status: property.status || 'New Lead',
            property_address: property.property_address || '',
            property_city: property.property_city || '',
            property_state: property.property_state || '',
            property_postal_code: property.property_postal_code || '',
            market_value: property.market_value || '',
            beds: property.beds || '',
            baths: property.baths || '',
            square_footage: property.square_footage || '',
            notes: property.notes || '',
            contacts: contactData || [],
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load lead data.");
        setFormData({ contacts: [] });
      } finally {
        setIsLoading(false);
      }
    };
    fetchAndSetData();
  }, [isOpen, property]);

  const handlePropertyInputChange = (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData((prev: any) => ({ ...prev, [name]: value }));
  };
  
  // Specific handler for HeroSelect as its onChange might pass value directly
  const handleSelectChange = (value: string | number) => {
    setFormData((prev: any) => ({ ...prev, status: value as LeadStatus }));
  };


  const handleContactInputChange = (e: ChangeEvent<HTMLInputElement>, index: number) => {
    const { name, value } = e.target;
    setFormData((prev: any) => {
        const newContacts = [...prev.contacts];
        newContacts[index] = { ...newContacts[index], [name]: value };
        return { ...prev, contacts: newContacts };
    });
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!property) return; // Should not happen if form is for existing property
    setIsSaving(true);
    setError(null);

    // Only updating status and notes as per original logic
    const response = await updatePropertyAction(property.property_id, {
      status: formData.status as LeadStatus,
      notes: formData.notes,
      // To update other fields, they need to be added here and to server action
      // property_address: formData.property_address,
      // property_city: formData.property_city,
      // etc.
      // And for contacts, a separate update logic/action would be needed.
    });

    if (response.success) {
      onClose();
    } else {
      setError(response.error || "Failed to save changes.");
    }
    setIsSaving(false);
  };

  const handleDelete = async () => {
    if (!property) return;
    // Consider using a HeroUI Modal for confirmation if available and desired
    if (window.confirm('Are you sure you want to permanently delete this property and all its associated contacts? This action cannot be undone.')) {
        setIsDeleting(true);
        setError(null);
        const response = await deletePropertyAction(property.property_id);
        if (response.success) {
            onClose();
        } else {
            setError(response.error || "Failed to delete property.");
        }
        setIsDeleting(false);
    }
  };

  const fullAddressForMap = property ? formatAddress(property) : '';

  return (
    <>
      {/* Inline style tag removed as requested */}
      <Modal
          isOpen={isOpen}
          onClose={onClose}
          backdrop="transparent" // Explicitly set backdrop to transparent
          // The className "no-backdrop" should be handled by the Modal component itself or its configuration
          // For now, assuming `Modal` from `ui/modal` might have a prop for this or handles it.
          className="w-full max-w-4xl h-[90vh] overflow-hidden" // Adjusted max-width for better layout
      >
          <div className="flex justify-between items-center p-4 border-b border-gray-200 dark:border-gray-700">
              <h3 className="font-semibold text-lg flex items-center gap-2 text-gray-800 dark:text-white">
                  <MapPin size={20} className="text-primary-500" />
                  Lead Details
              </h3>
              <Button variant="light" isIconOnly onClick={onClose} aria-label="Close modal" size="sm">
                  <X size={20} />
              </Button>
          </div>

          {isLoading || (!property && isOpen) ? ( // Show spinner if loading or if it's a new lead form still initializing
              <div className="flex items-center justify-center h-full p-8"><Spinner size="lg" /></div>
          ) : (
          <form onSubmit={handleSubmit} id="lead-update-form" className="h-[calc(100%-130px)] flex flex-col"> {/* Adjusted height for header and footer */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 flex-grow min-h-0 p-4 overflow-y-auto">
                  {/* --- Left Column (Map) --- */}
                  <div className="h-full bg-gray-100 dark:bg-gray-800 rounded-md overflow-hidden min-h-[300px] lg:min-h-0 shadow-sm">
                      {property && <StreetViewMap address={fullAddressForMap} />}
                  </div>

                  {/* --- Right Column (Details) --- */}
                  <div className="space-y-3 overflow-y-auto pr-1 pb-2 scrollbar-thin"> {/* Added scrollbar styling */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-3">
                          <HeroSelect
                              label="Status"
                              name="status"
                              value={formData.status}
                              onValueChange={handleSelectChange} // HeroUI Select might use onValueChange
                              size="sm"
                          >
                              {leadStatusOptions.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                          </HeroSelect>
                          <FormInput label="Appraised Value" name="market_value" value={formData.market_value} onChange={handlePropertyInputChange} type="number" />
                      </div>
                      <FormInput label="Street Address" name="property_address" value={formData.property_address} onChange={handlePropertyInputChange} />
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-x-3">
                          <FormInput label="City" name="property_city" value={formData.property_city} onChange={handlePropertyInputChange} />
                          <FormInput label="State" name="property_state" value={formData.property_state} onChange={handlePropertyInputChange} />
                          <FormInput label="Zip" name="property_postal_code" value={formData.property_postal_code} onChange={handlePropertyInputChange} />
                      </div>
                      <div className="grid grid-cols-3 gap-x-3">
                          <FormInput label="Beds" name="beds" value={formData.beds} onChange={handlePropertyInputChange} type="number" />
                          <FormInput label="Baths" name="baths" value={formData.baths} onChange={handlePropertyInputChange} type="number" />
                          <FormInput label="SQ FT" name="square_footage" value={formData.square_footage} onChange={handlePropertyInputChange} type="number" />
                      </div>

                      <div className="pt-3">
                          <h4 className="font-semibold text-sm mb-1 text-gray-700 dark:text-gray-300">CONTACTS</h4>
                          {formData.contacts && formData.contacts.length > 0 ? (
                            <Accordion type="single" collapsible className="w-full space-y-1">
                                {(formData.contacts).map((contact: Contact, index: number) => (
                                    <AccordionItem key={contact.contact_id || `new-${index}`} value={contact.contact_id || `new-${index}`}>
                                        <Accordion.Trigger className="text-sm font-medium w-full text-left p-2 bg-gray-100 dark:bg-gray-800 rounded-md hover:bg-gray-200 dark:hover:bg-gray-700">
                                            {contact.name || `Contact ${index + 1}`}
                                        </Accordion.Trigger>
                                        <Accordion.Content className="p-2 pt-1 bg-white dark:bg-gray-800/50 rounded-b-md">
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-3 mt-1">
                                                <FormInput label="Full Name" name="name" value={contact.name} onChange={(e:ChangeEvent<HTMLInputElement>) => handleContactInputChange(e, index)} />
                                                <FormInput label="Phone" name="phone" value={contact.phone} onChange={(e:ChangeEvent<HTMLInputElement>) => handleContactInputChange(e, index)} type="tel" />
                                            </div>
                                            <FormInput label="Email" name="email" value={contact.email} onChange={(e:ChangeEvent<HTMLInputElement>) => handleContactInputChange(e, index)} type="email" className="mt-2"/>
                                        </Accordion.Content>
                                    </AccordionItem>
                                ))}
                            </Accordion>
                          ) : (
                            <p className="text-xs text-gray-500 dark:text-gray-400">No contacts found for this property.</p>
                          )}
                      </div>
                      
                      <HeroTextarea
                          label="Notes"
                          name="notes"
                          value={formData.notes}
                          onChange={handlePropertyInputChange}
                          className="w-full min-h-[80px]" // Assuming HeroTextarea has similar sizing
                          size="sm"
                      />
                  </div>
              </div>

              {error && <p className="text-danger-500 text-sm p-4 text-center">{error}</p>}

              <div className="flex justify-between items-center p-4 border-t border-gray-200 dark:border-gray-700">
                  <Button color="danger" variant="outline" onClick={handleDelete} isLoading={isDeleting} disabled={isDeleting || !property}>
                      {isDeleting ? 'Deleting...' : 'Delete Lead'}
                  </Button>
                  <Button color="primary" type="submit" isLoading={isSaving} disabled={isSaving || !property}>
                      {isSaving ? 'Updating...' : 'Update Lead'}
                  </Button>
              </div>
          </form>
          )}
      </Modal>
    </>
  );
};

export default LeadFormModal;