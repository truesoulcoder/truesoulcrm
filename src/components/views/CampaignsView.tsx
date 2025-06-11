"use client";

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase/client';
import type { Database } from '@/types';
import {
  Button,
  Input,
  Select,
  SelectItem,
  Badge,
  Spinner,
  Modal,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Card, // Assuming Card for table container
} from '@heroui/react'; // Assuming these components exist
import { AlertCircle, Edit3, PlusCircle } from 'lucide-react'; // Icons

// Define shorter types for convenience based on the new schema
type Campaign = Database['public']['Tables']['campaigns']['Row'];
type CampaignInsert = Database['public']['Tables']['campaigns']['Insert'];
type CampaignStatus = Database['public']['Enums']['campaign_status'];

// Campaign status options for the Select component
const campaignStatusOptions: { value: CampaignStatus; label: string }[] = [
  { value: 'draft', label: 'Draft' },
  { value: 'active', label: 'Active' },
  { value: 'paused', label: 'Paused' },
  { value: 'completed', label: 'Completed' },
  { value: 'archived', label: 'Archived' },
];

export default function CampaignsView() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true); // General loading for table
  const [isSubmitting, setIsSubmitting] = useState(false); // Loading for form submission
  const [error, setError] = useState<string | null>(null);
  
  const [formData, setFormData] = useState<Partial<Campaign>>({
    name: '',
    status: 'draft',
  });
  const [editingId, setEditingId] = useState<string | null>(null);

  const fetchCampaigns = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const { data, error: fetchError } = await supabase
        .from('campaigns')
        .select('*')
        .order('created_at', { ascending: false });

      if (fetchError) throw fetchError;
      setCampaigns(data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch campaigns.');
      console.error('Error fetching campaigns:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchCampaigns();
  }, [fetchCampaigns]);

  const resetForm = () => {
    setFormData({ name: '', status: 'draft' });
    setEditingId(null);
  };

  const handleOpenModal = (campaign?: Campaign) => {
    if (campaign) {
      setFormData({ name: campaign.name, status: campaign.status });
      setEditingId(campaign.id);
    } else {
      resetForm();
    }
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    if (isSubmitting) return; // Prevent closing while submitting
    setIsModalOpen(false);
    resetForm();
    setError(null); // Clear form-specific errors on close
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    
    if (!formData.name?.trim()) {
      setError('Campaign name is required.');
      return;
    }

    setIsSubmitting(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("User not authenticated.");

      const campaignData: Partial<Campaign> = {
        name: formData.name,
        status: formData.status as CampaignStatus,
        user_id: user.id,
      };

      const { error: upsertError } = editingId
        ? await supabase.from('campaigns').update(campaignData).eq('id', editingId)
        : await supabase.from('campaigns').insert(campaignData as CampaignInsert);

      if (upsertError) throw upsertError;

      await fetchCampaigns();
      handleCloseModal();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save campaign.';
      setError(message); // Display error in the modal
      console.error('Error saving campaign:', message);
    } finally {
      setIsSubmitting(false);
    }
  };
  
  const getBadgeColor = (status: CampaignStatus): "primary" | "secondary" | "success" | "warning" | "danger" | "neutral" => {
    switch (status) {
      case 'active': return 'success';
      case 'paused': return 'warning';
      case 'completed': return 'primary';
      case 'archived': return 'neutral';
      case 'draft': return 'secondary';
      default: return 'neutral';
    }
  };

  return (
    <div className="w-full h-full p-4 md:p-6"> {/* Added padding to main container */}
      <div className="flex flex-col sm:flex-row justify-between items-center mb-6 gap-4">
        <h1 className="text-2xl font-bold text-gray-800 dark:text-white">Campaigns</h1>
        <Button color="primary" onClick={() => handleOpenModal()}>
          <PlusCircle size={18} className="mr-2" />
          Create Campaign
        </Button>
      </div>

      {/* Main error display - could be a HeroUI Alert component if available */}
      {error && !isModalOpen && ( // Only show general errors here, modal errors are shown inside modal
        <div className="bg-danger-100 border border-danger-400 text-danger-700 px-4 py-3 rounded-md relative mb-4 flex items-start" role="alert">
          <AlertCircle className="w-5 h-5 mr-2 text-danger-700" />
          <span className="block sm:inline">{error}</span>
        </div>
      )}

      <Card className="shadow-lg rounded-lg"> {/* Using Card for table container */}
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-800">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Name</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Created</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Last Updated</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
              {isLoading && !campaigns.length ? ( // Show spinner only if no data yet
                <tr><td colSpan={5} className="text-center py-10"><Spinner size="lg" /></td></tr>
              ) : campaigns.length > 0 ? (
                campaigns.map((campaign) => (
                  <tr key={campaign.id} className="hover:bg-gray-100 dark:hover:bg-gray-700">
                    <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">{campaign.name}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm">
                      <Badge color={getBadgeColor(campaign.status)} variant="solid">
                        {campaign.status.charAt(0).toUpperCase() + campaign.status.slice(1)}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{new Date(campaign.created_at).toLocaleDateString()}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{new Date(campaign.updated_at).toLocaleDateString()}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm">
                      <Button variant="ghost" size="sm" onClick={() => handleOpenModal(campaign)} aria-label="Edit campaign">
                        <Edit3 size={16} />
                      </Button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr><td colSpan={5} className="text-center py-10 text-gray-500 dark:text-gray-400">No campaigns found.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {isModalOpen && (
        <Modal isOpen={isModalOpen} onClose={handleCloseModal}>
          <ModalHeader>{editingId ? 'Edit Campaign' : 'Create New Campaign'}</ModalHeader>
          <form onSubmit={handleSubmit}>
            <ModalBody className="space-y-4">
              {error && ( // Display error inside modal
                <div className="bg-danger-100 border border-danger-400 text-danger-700 px-4 py-3 rounded-md relative flex items-start" role="alert">
                  <AlertCircle className="w-5 h-5 mr-2 text-danger-700" />
                  <span className="block sm:inline">{error}</span>
                </div>
              )}
              <div>
                <Input 
                  id="name" 
                  name="name" 
                  type="text" 
                  label="Campaign Name"
                  placeholder="Enter campaign name"
                  value={formData.name || ''} 
                  onChange={(e) => setFormData(p => ({...p, name: e.target.value}))} 
                  required 
                  className="w-full"
                />
              </div>
              <div>
                <Select
                  id="status"
                  name="status"
                  label="Status"
                  placeholder="Select status"
                  value={formData.status || 'draft'}
                  onValueChange={(value) => setFormData(p => ({...p, status: value as CampaignStatus}))}
                  className="w-full"
                >
                  {campaignStatusOptions.map(option => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </Select>
              </div>
            </ModalBody>
            <ModalFooter>
              <Button type="button" variant="outline" onClick={handleCloseModal} disabled={isSubmitting}>
                Cancel
              </Button>
              <Button type="submit" color="primary" isLoading={isSubmitting} disabled={isSubmitting}>
                {isSubmitting ? 'Saving...' : 'Save Campaign'}
              </Button>
            </ModalFooter>
          </form>
        </Modal>
      )}
    </div>
  );
}