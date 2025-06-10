'use client';

import { useState, useEffect, FormEvent, ChangeEvent } from 'react';
import { supabase } from '@/lib/supabase/client';
import { X, Users, Pencil, Home, DollarSign, Calendar, Hash, Tag, Phone, Mail, MapPin } from 'lucide-react';
import StreetViewMap from '@/components/maps/StreetViewMap';
import { updatePropertyAction, deletePropertyAction } from '@/app/crm/actions';
import { type Database, Tables, Enums } from '@/types/supabase';
import { Modal } from '@/components/ui/modal';
import { formatAddress } from '@/utils/address';

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

// A generic form input component for this modal
const FormInput = ({ label, name, value, onChange, placeholder = '', type = 'text', className = '' }: any) => (
    <div className={`form-control ${className}`}>
        <label className="label py-1"><span className="label-text text-xs font-semibold">{label}</span></label>
        <input 
            type={type}
            name={name}
            value={value || ''}
            onChange={onChange}
            placeholder={placeholder}
            className="input input-bordered input-sm"
        />
    </div>
);

const LeadFormModal = ({ property, isOpen, onClose }: LeadFormModalProps) => {
  const [formData, setFormData] = useState<any>({ contacts: [] });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Effect to fetch contacts and populate all form data
  useEffect(() => {
    if (!isOpen || !property) {
        setIsLoading(false);
        return;
    }
    
    const fetchAndSetData = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const { data: contactData, error: fetchError } = await supabase.from('contacts').select('*').eq('property_id', property.property_id);
        if (fetchError) throw fetchError;

        setFormData({
            // Property fields
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
            // All contacts are now editable in their own object within an array
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
    if (!property) return;
    setIsSaving(true);
    setError(null);
    
    const response = await updatePropertyAction(property.property_id, {
      status: formData.status as LeadStatus,
      notes: formData.notes,
    });
    // NOTE: Saving of other property fields and contact fields requires new server actions.

    if (response.success) {
      onClose();
    } else {
      setError(response.error || "Failed to save changes.");
    }
    setIsSaving(false);
  };

  const handleDelete = async () => {
    if (!property) return;
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
    <Modal isOpen={isOpen} onClose={onClose} className="w-11/12 max-w-7xl h-[90vh]">
        <div className="flex justify-between items-center mb-4">
            <h3 className="font-bold text-lg flex items-center gap-2">
                <MapPin size={20} className="text-primary"/>
                Lead Details
            </h3>
            <button type="button" onClick={onClose} className="btn btn-sm btn-circle btn-ghost absolute right-2 top-2 z-10">
                <X size={20} />
            </button>
        </div>

        {isLoading || !property ? (
             <div className="flex items-center justify-center h-full"><span className="loading loading-spinner loading-lg"></span></div>
        ) : (
        <form onSubmit={handleSubmit} id="lead-update-form" className="h-full flex flex-col">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 flex-grow min-h-0">
                {/* --- Left Column (Map) --- */}
                <div className="h-full bg-base-300 rounded-lg overflow-hidden min-h-[400px] lg:min-h-0">
                    <StreetViewMap address={fullAddressForMap} />
                </div>

                {/* --- Right Column (Details) --- */}
                <div className="space-y-4 overflow-y-auto pr-2">
                    {/* Property Details */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4">
                        <div className="form-control">
                            <label className="label py-1"><span className="label-text text-xs font-semibold">Status</span></label>
                            <select name="status" className="select select-bordered select-sm" value={formData.status} onChange={handlePropertyInputChange}>
                                {leadStatusOptions.map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                        </div>
                         <FormInput label="Appraised Value" name="market_value" value={formData.market_value} onChange={handlePropertyInputChange} type="number" />
                    </div>
                    <FormInput label="Street Address" name="property_address" value={formData.property_address} onChange={handlePropertyInputChange} />
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-x-4">
                        <FormInput label="City" name="property_city" value={formData.property_city} onChange={handlePropertyInputChange} />
                        <FormInput label="State" name="property_state" value={formData.property_state} onChange={handlePropertyInputChange} />
                        <FormInput label="Zip" name="property_postal_code" value={formData.property_postal_code} onChange={handlePropertyInputChange} />
                    </div>
                    <div className="grid grid-cols-3 gap-x-4">
                         <FormInput label="Beds" name="beds" value={formData.beds} onChange={handlePropertyInputChange} type="number" />
                         <FormInput label="Baths" name="baths" value={formData.baths} onChange={handlePropertyInputChange} type="number" />
                         <FormInput label="SQ FT" name="square_footage" value={formData.square_footage} onChange={handlePropertyInputChange} type="number" />
                    </div>
                    
                    {/* Contacts Accordion */}
                    <div className="pt-4">
                         <h4 className="font-semibold text-md mb-2">CONTACTS</h4>
                         <div className="space-y-2">
                            {(formData.contacts || []).map((contact: Contact, index: number) => (
                                <div key={contact.contact_id} className="collapse collapse-arrow bg-base-200">
                                    <input type="radio" name="contact-accordion" defaultChecked={index === 0} />
                                    <div className="collapse-title text-sm font-medium">
                                        {contact.name || `Contact ${index + 1}`}
                                    </div>
                                    <div className="collapse-content">
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4">
                                            <FormInput label="Full Name" name="name" value={contact.name} onChange={(e:ChangeEvent<HTMLInputElement>) => handleContactInputChange(e, index)} />
                                            <FormInput label="Phone" name="phone" value={contact.phone} onChange={(e:ChangeEvent<HTMLInputElement>) => handleContactInputChange(e, index)} type="tel" />
                                        </div>
                                        <FormInput label="Email" name="email" value={contact.email} onChange={(e:ChangeEvent<HTMLInputElement>) => handleContactInputChange(e, index)} type="email" />
                                    </div>
                                </div>
                            ))}
                         </div>
                    </div>

                    {/* Notes */}
                     <div className="form-control">
                        <label className="label py-1"><span className="label-text text-xs font-semibold">Notes</span></label>
                        <textarea name="notes" className="textarea textarea-bordered textarea-sm h-24" value={formData.notes} onChange={handlePropertyInputChange}></textarea>
                    </div>
                </div>
            </div>
            
            {error && <p className="text-error text-sm mt-4 text-center">{error}</p>}
            
            {/* Modal Actions */}
            <div className="flex justify-between items-center mt-6 pt-4 border-t border-base-content/10">
                <button type="button" className="btn btn-error" onClick={handleDelete} disabled={isDeleting}>
                    {isDeleting ? <span className="loading loading-spinner loading-xs"></span> : 'Delete Lead'}
                </button>
                <div>
                    <button type="button" className="btn btn-ghost" onClick={onClose} disabled={isSaving}>Cancel</button>
                    <button type="submit" form="lead-update-form" className="btn btn-primary ml-2" disabled={isSaving}>
                        {isSaving ? <span className="loading loading-spinner loading-xs"></span> : 'Update Lead'}
                    </button>
                </div>
            </div>
        </form>
        )}
    </Modal>
  );
};

export default LeadFormModal;