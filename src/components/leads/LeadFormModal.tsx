'use client';

import { useState, useEffect, FormEvent, ChangeEvent } from 'react';
import { supabase } from '@/lib/supabase/client';
import { MapPin } from 'lucide-react'; // X for close can be handled by HeroUI ModalHeader
import StreetViewMap from '@/components/maps/StreetViewMap';
import { updatePropertyAction, deletePropertyAction } from '@/app/crm/actions';
import { type Database, Tables, Enums } from '@/types/supabase';
// import { Modal } from '@/components/ui/modal'; // Removed custom Modal wrapper
import { formatAddress } from '@/utils/address';
import { 
    Button, 
    Spinner, 
    Input as HeroInput, 
    Select as HeroSelect, 
    SelectItem, 
    Textarea as HeroTextarea,
    Accordion,
    AccordionItem,
    Modal as HeroModal, // Imported HeroUI Modal
    ModalContent,
    ModalHeader,
    ModalBody,
    ModalFooter,
} from '@heroui/react';
import { Icon } from '@iconify/react'; // For icons in header if needed

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
    <HeroModal 
        isOpen={isOpen} 
        onOpenChange={(open) => !open && onClose()} // Call onClose when modal is closed
        size="4xl" 
        backdrop="opaque" // Using opaque as per instructions, was transparent
        scrollBehavior="inside"
        // className="h-[90vh]" // HeroUI Modal might have specific ways to set height, or rely on content
    >
      <ModalContent className="h-[90vh] flex flex-col"> {/* Added flex flex-col for footer placement */}
        {(modalOnClose) => ( // modalOnClose is provided by ModalContent for default close button
          <>
            <ModalHeader className="flex justify-between items-center">
                <h3 className="font-semibold text-lg flex items-center gap-2">
                    <Icon icon="lucide:map-pin" className="text-primary h-5 w-5" /> {/* Using Iconify */}
                    Lead Details
                </h3>
                {/* Standard close button is often part of ModalHeader or handled by ModalContent by default.
                    If a custom one is needed:
                <Button isIconOnly variant="light" onPress={modalOnClose} size="sm">
                    <Icon icon="lucide:x" className="h-5 w-5" />
                </Button>
                */}
            </ModalHeader>

            {isLoading || (!property && isOpen) ? (
                <ModalBody className="flex items-center justify-center"> {/* Ensure ModalBody takes up space */}
                    <Spinner size="lg" />
                </ModalBody>
            ) : (
            <form onSubmit={handleSubmit} id="lead-update-form" className="flex flex-col flex-grow min-h-0"> {/* Form wraps body and footer */}
                <ModalBody className="grid grid-cols-1 lg:grid-cols-2 gap-6 overflow-y-auto"> {/* Removed p-4, ModalBody has padding */}
                    {/* --- Left Column (Map) --- */}
                    <div className="h-full bg-gray-100 dark:bg-gray-800 rounded-md overflow-hidden min-h-[300px] lg:min-h-0 shadow-sm">
                        {property && <StreetViewMap address={fullAddressForMap} />}
                    </div>

                    {/* --- Right Column (Details) --- */}
                    <div className="space-y-3 overflow-y-auto pr-1 pb-2 scrollbar-thin">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-3">
                            <HeroSelect
                                label="Status"
                                name="status"
                                selectedKeys={formData.status ? [formData.status] : []} // HeroSelect expects an iterable
                                onSelectionChange={(keys) => handleSelectChange(Array.from(keys)[0] as LeadStatus)}
                                size="sm"
                                labelPlacement="outside" // As per original OmegaTable example
                            >
                                {leadStatusOptions.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                            </HeroSelect>
                            <FormInput label="Appraised Value" name="market_value" value={formData.market_value} onChange={handlePropertyInputChange} type="number" labelPlacement="outside" />
                        </div>
                        <FormInput label="Street Address" name="property_address" value={formData.property_address} onChange={handlePropertyInputChange} labelPlacement="outside" />
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-x-3">
                            <FormInput label="City" name="property_city" value={formData.property_city} onChange={handlePropertyInputChange} labelPlacement="outside" />
                            <FormInput label="State" name="property_state" value={formData.property_state} onChange={handlePropertyInputChange} labelPlacement="outside" />
                            <FormInput label="Zip" name="property_postal_code" value={formData.property_postal_code} onChange={handlePropertyInputChange} labelPlacement="outside" />
                        </div>
                        <div className="grid grid-cols-3 gap-x-3">
                            <FormInput label="Beds" name="beds" value={formData.beds} onChange={handlePropertyInputChange} type="number" labelPlacement="outside" />
                            <FormInput label="Baths" name="baths" value={formData.baths} onChange={handlePropertyInputChange} type="number" labelPlacement="outside" />
                            <FormInput label="SQ FT" name="square_footage" value={formData.square_footage} onChange={handlePropertyInputChange} type="number" labelPlacement="outside" />
                        </div>

                        <div className="pt-3">
                            <h4 className="font-semibold text-sm mb-1 text-gray-700 dark:text-gray-300">CONTACTS</h4>
                            {formData.contacts && formData.contacts.length > 0 ? (
                              <Accordion selectionMode="multiple" variant="splitted" className="w-full space-y-1">
                                  {(formData.contacts).map((contact: Contact, index: number) => (
                                      <AccordionItem 
                                        key={contact.contact_id || `new-${index}`} 
                                        // @ts-ignore // title might expect string, but node is fine for HeroUI
                                        title={contact.name || `Contact ${index + 1}`}
                                        // className="text-sm font-medium" // Apply styling to trigger if needed
                                      >
                                          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-3 mt-1">
                                              <FormInput label="Full Name" name="name" value={contact.name} onChange={(e:ChangeEvent<HTMLInputElement>) => handleContactInputChange(e, index)} labelPlacement="outside" />
                                              <FormInput label="Phone" name="phone" value={contact.phone} onChange={(e:ChangeEvent<HTMLInputElement>) => handleContactInputChange(e, index)} type="tel" labelPlacement="outside" />
                                          </div>
                                          <FormInput label="Email" name="email" value={contact.email} onChange={(e:ChangeEvent<HTMLInputElement>) => handleContactInputChange(e, index)} type="email" className="mt-2" labelPlacement="outside"/>
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
                            className="w-full min-h-[80px]"
                            size="sm"
                            labelPlacement="outside"
                        />
                    </div>
                </ModalBody>
                
                {error && <p className="text-danger text-sm px-6 py-2 text-center">{error}</p>}

                <ModalFooter>
                    <Button color="danger" variant="light" onPress={handleDelete} isLoading={isDeleting} disabled={isDeleting || !property}>
                        {isDeleting ? 'Deleting...' : 'Delete Lead'}
                    </Button>
                    <Button color="primary" type="submit" form="lead-update-form" isLoading={isSaving} disabled={isSaving || !property}>
                        {isSaving ? 'Updating...' : 'Update Lead'}
                    </Button>
                </ModalFooter>
            </form>
            )}
          </>
        )}
      </ModalContent>
    </HeroModal>
  );
};

export default LeadFormModal;