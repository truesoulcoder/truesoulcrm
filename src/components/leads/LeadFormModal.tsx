'use client';

import { useState, useEffect, FormEvent, ChangeEvent, useRef } from 'react';
import { supabase } from '@/lib/supabase/client';
import { X, Users, Pencil, MapPin, Building, Tag, Home, DollarSign, Calendar, Hash } from 'lucide-react';
import StreetViewMap from '@/components/maps/StreetViewMap';
import { updatePropertyAction, deletePropertyAction } from '@/app/crm/actions';
import { type Database, Tables, Enums } from '@/types/supabase';
import { Constants } from '@/types/supabase';

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

const InfoRow = ({ icon, label, value }: { icon: React.ReactNode, label: string, value: React.ReactNode }) => (
    <div className="flex justify-between items-center text-sm py-1 border-b border-base-100/10">
        <div className="flex items-center gap-2 text-base-content/70">
            {icon}
            <span>{label}</span>
        </div>
        <span className="font-medium text-base-content">{value || '-'}</span>
    </div>
);


const LeadFormModal = ({ property, isOpen, onClose }: LeadFormModalProps) => {
  const dialogRef = useRef<HTMLDialogElement>(null);
  
  const [formData, setFormData] = useState({
    status: property?.status || 'New Lead',
    notes: property?.notes || '',
  });
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [isLoadingContacts, setIsLoadingContacts] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (isOpen && property) {
      dialog?.showModal();
    } else {
      dialog?.close();
    }
  }, [isOpen, property]);

  useEffect(() => {
    if (!isOpen || !property?.property_id) {
        setContacts([]);
        return;
    };
    const fetchContacts = async () => {
      setIsLoadingContacts(true);
      setError(null);
      try {
        const { data, error: fetchError } = await supabase.from('contacts').select('*').eq('property_id', property.property_id);
        if (fetchError) throw fetchError;
        setContacts(data || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load contacts.");
      } finally {
        setIsLoadingContacts(false);
      }
    };
    fetchContacts();
  }, [isOpen, property]);

  useEffect(() => {
    setFormData({ status: property?.status || 'New Lead', notes: property?.notes || '' });
  }, [property]);

  const handleInputChange = (e: ChangeEvent<HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!property) return;
    setError(null);
    const response = await updatePropertyAction(property.property_id, {
      status: formData.status as LeadStatus,
      notes: formData.notes,
    });
    if (response.success) {
      onClose();
    } else {
      setError(response.error || "Failed to save changes.");
    }
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

  const getRoleClass = (role: Contact['role']) => {
    return { 'owner': 'badge-primary', 'mls_agent': 'badge-secondary', 'alternate_contact': 'badge-accent' }[role || ''] || 'badge-ghost';
  };

  return (
    <dialog ref={dialogRef} className="modal" onClose={onClose}>
      <div className="modal-box w-11/12 max-w-5xl bg-base-200">
        <form method="dialog">
            <button className="btn btn-sm btn-circle btn-ghost absolute right-2 top-2 z-10">✕</button>
        </form>
        {property ? (
          <>
            <h3 className="font-bold text-lg -mt-2">Lead Details</h3>
            <p className="text-sm text-base-content/60">{property.property_address}, {property.property_city}</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4 mt-4">
                <div className="space-y-4">
                    <div className="h-60 w-full bg-base-300 rounded-lg overflow-hidden">
                        <StreetViewMap address={`${property.property_address}, ${property.property_city}`} />
                    </div>
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div className="form-control">
                            <label className="label"><span className="label-text flex items-center gap-2"><Tag size={16}/>Lead Status</span></label>
                            <select name="status" className="select select-bordered" value={formData.status} onChange={handleInputChange}>
                                {leadStatusOptions.map(status => (
                                    <option key={status} value={status}>{status}</option>
                                ))}
                            </select>
                        </div>
                        <div className="form-control">
                            <label className="label"><span className="label-text flex items-center gap-2"><Pencil size={16}/>Notes</span></label>
                            <textarea name="notes" className="textarea textarea-bordered h-32" value={formData.notes || ''} onChange={handleInputChange}></textarea>
                        </div>
                         {error && <p className="text-error text-sm">{error}</p>}
                    </form>
                </div>
                <div className="space-y-4">
                     <div className="space-y-2">
                        <h4 className="font-bold text-base flex items-center gap-2"><Home size={18}/>Property Information</h4>
                        <div className="p-4 bg-base-100 rounded-lg">
                            <InfoRow icon={<Hash size={14}/>} label="Beds / Baths" value={`${property.beds || '?'} / ${property.baths || '?'}`} />
                            <InfoRow icon={<Hash size={14}/>} label="Square Footage" value={property.square_footage?.toLocaleString()} />
                            <InfoRow icon={<Calendar size={14}/>} label="Year Built" value={property.year_built} />
                            <InfoRow icon={<DollarSign size={14}/>} label="Market Value" value={property.market_value?.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 })} />
                        </div>
                     </div>
                     <div className="space-y-2">
                        <h4 className="font-bold text-base flex items-center gap-2"><Users size={18}/>Associated Contacts</h4>
                         <div className="space-y-3 max-h-64 overflow-y-auto pr-2">
                            {isLoadingContacts ? (
                                <div className="text-center p-4"><span className="loading loading-spinner"></span></div>
                            ) : contacts.length > 0 ? (
                                contacts.map(contact => (
                                   <div key={contact.contact_id} className="card card-compact bg-base-100 shadow">
                                     <div className="card-body">
                                       <div className="flex justify-between items-center">
                                         <h5 className="card-title text-base">{contact.name}</h5>
                                         <div className={`badge ${getRoleClass(contact.role)}`}>{contact.role?.replace('_', ' ')}</div>
                                       </div>
                                       <p className="text-sm text-base-content/70">{contact.email}</p>
                                       <p className="text-sm text-base-content/70">{contact.phone || 'No phone number'}</p>
                                     </div>
                                   </div>
                                ))
                            ) : (
                                <p className="text-sm text-base-content/60 p-4 text-center">No contacts found for this property.</p>
                            )}
                         </div>
                     </div>
                </div>
            </div>
             <div className="modal-action mt-6">
                <button type="button" className="btn btn-error" onClick={handleDelete} disabled={isDeleting}>
                    {isDeleting ? <span className="loading loading-spinner loading-xs"></span> : 'Delete Lead'}
                </button>
                <div className="flex-grow"></div>
                <form method="dialog">
                    <button className="btn btn-ghost">Cancel</button>
                </form>
                <button type="submit" form="lead-update-form" className="btn btn-primary" onClick={handleSubmit}>Save Changes</button>
             </div>
          </>
        ) : (
            <div className="text-center p-8"><span className="loading loading-spinner"></span></div>
        )}
      </div>
    </dialog>
  );
};

export default LeadFormModal;