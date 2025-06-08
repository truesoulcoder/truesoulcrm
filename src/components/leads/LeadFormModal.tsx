'use client';

import { useState, useEffect, useRef, ChangeEvent } from 'react';
import { X, MapPin } from 'lucide-react';
import StreetViewMap from '@/components/maps/StreetViewMap';
import { useGoogleMapsApi } from '@/components/maps/GoogleMapsLoader';
import type { Database } from '@/types';

// Define shorter types for convenience based on the new schema
type Lead = Database['public']['Tables']['leads']['Row'];
type LeadInsert = Database['public']['Tables']['leads']['Insert'];

interface LeadFormModalProps {
  lead?: Partial<Lead>;
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (leadData: LeadInsert) => Promise<void>;
  onDelete?: (leadId: string) => Promise<void>;
  isEditMode?: boolean;
}

const LeadFormModal = ({
  lead = {},
  isOpen,
  onClose,
  onSubmit,
  onDelete,
  isEditMode = false,
}: LeadFormModalProps) => {
  
  const initialFormState: LeadInsert = {
    email: '',
    first_name: '',
    last_name: '',
    property_address: '',
    property_city: '',
    property_state: '',
    property_postal_code: '',
    market_region: '',
    phone: '',
    // user_id will be set by the server action
  };

  const [formData, setFormData] = useState<LeadInsert>(initialFormState);
  const [mapAddress, setMapAddress] = useState('');
  const modalRef = useRef<HTMLDivElement>(null);
  const { isLoaded: isMapsApiLoaded } = useGoogleMapsApi();

  useEffect(() => {
    if (isOpen) {
      const currentLeadData = {
        email: lead.email ?? '',
        first_name: lead.first_name ?? '',
        last_name: lead.last_name ?? '',
        property_address: lead.property_address ?? '',
        property_city: lead.property_city ?? '',
        property_state: lead.property_state ?? '',
        property_postal_code: lead.property_postal_code ?? '',
        market_region: lead.market_region ?? '',
        phone: (lead as any).phone ?? '', // Safely access phone
        user_id: lead.user_id, // Keep user_id if present for updates
      };
      setFormData(currentLeadData);
      setMapAddress(currentLeadData.property_address || '');
    }
  }, [lead, isOpen]);

  const handleInputChange = (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSubmit(formData);
    onClose();
  };

  const handleDelete = async () => {
    if (isEditMode && lead.id && onDelete) {
      if (window.confirm('Are you sure you want to delete this lead?')) {
        await onDelete(lead.id);
        onClose();
      }
    }
  };
  
  useEffect(() => {
    const handler = setTimeout(() => {
      setMapAddress(formData.property_address || '');
    }, 1000); // 1-second delay after user stops typing

    return () => {
      clearTimeout(handler);
    };
  }, [formData.property_address]);

  if (!isOpen) return null;

  return (
    <div className="modal modal-open" role="dialog">
      <div ref={modalRef} className="modal-box w-11/12 max-w-4xl bg-base-200">
        <button className="btn btn-sm btn-circle btn-ghost absolute right-2 top-2" onClick={onClose}>
          <X size={18} />
        </button>
        <h3 className="font-bold text-lg mb-4">
          {isEditMode ? 'Edit Lead' : 'Create New Lead'}
        </h3>

        <div className="mb-4 h-64 w-full bg-base-300 rounded-lg overflow-hidden">
          {isMapsApiLoaded && mapAddress ? (
            <StreetViewMap address={mapAddress} isMapsApiLoaded={isMapsApiLoaded} />
          ) : (
            <div className="flex items-center justify-center h-full text-base-content/50">
                <MapPin className="mr-2" />
                <span>Enter a property address to see Street View</span>
            </div>
          )}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 pt-4">
          <h4 className="font-bold text-base-content/80 uppercase tracking-wider">Location</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="form-control md:col-span-2">
              <label className="label"><span className="label-text">Property Address</span></label>
              <input type="text" name="property_address" placeholder="Start typing an address..." className="input input-bordered w-full" value={formData.property_address || ''} onChange={handleInputChange} />
            </div>
            <div className="form-control">
              <label className="label"><span className="label-text">City</span></label>
              <input type="text" name="property_city" placeholder="City" className="input input-bordered w-full" value={formData.property_city || ''} onChange={handleInputChange} />
            </div>
            <div className="form-control">
              <label className="label"><span className="label-text">State</span></label>
              <input type="text" name="property_state" placeholder="State" className="input input-bordered w-full" value={formData.property_state || ''} onChange={handleInputChange} />
            </div>
            <div className="form-control">
              <label className="label"><span className="label-text">Zip Code</span></label>
              <input type="text" name="property_postal_code" placeholder="Zip" className="input input-bordered w-full" value={formData.property_postal_code || ''} onChange={handleInputChange} />
            </div>
             <div className="form-control">
              <label className="label"><span className="label-text">Market Region</span></label>
              <input type="text" name="market_region" placeholder="e.g., Dallas" className="input input-bordered w-full" value={formData.market_region || ''} onChange={handleInputChange} />
            </div>
          </div>

          <div className="divider"></div>

          <h4 className="font-bold text-base-content/80 uppercase tracking-wider">Contact</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="form-control">
              <label className="label"><span className="label-text">First Name</span></label>
              <input type="text" name="first_name" placeholder="First Name" className="input input-bordered w-full" value={formData.first_name || ''} onChange={handleInputChange} />
            </div>
            <div className="form-control">
              <label className="label"><span className="label-text">Last Name</span></label>
              <input type="text" name="last_name" placeholder="Last Name" className="input input-bordered w-full" value={formData.last_name || ''} onChange={handleInputChange} />
            </div>
            <div className="form-control">
              <label className="label"><span className="label-text">Email</span></label>
              <input type="email" name="email" placeholder="Email" className="input input-bordered w-full" value={formData.email || ''} onChange={handleInputChange} required />
            </div>
            <div className="form-control">
                <label className="label"><span className="label-text">Phone</span></label>
                <input type="tel" name="phone" placeholder="Phone Number" className="input input-bordered w-full" value={formData.phone || ''} onChange={handleInputChange} />
            </div>
          </div>

          <div className="modal-action mt-6 flex justify-between items-center w-full">
            <div>
              {isEditMode && onDelete && (
                <button type="button" className="btn btn-error" onClick={handleDelete}>Delete Lead</button>
              )}
            </div>
            <div className="flex gap-2">
              <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
              <button type="submit" className="btn btn-primary">{isEditMode ? 'Update Lead' : 'Create Lead'}</button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

export default LeadFormModal;