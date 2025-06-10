"use client";

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase/client';
import type { Database } from '@/types';

// Define shorter types for convenience based on the new schema
type Campaign = Database['public']['Tables']['campaigns']['Row'];
type CampaignInsert = Database['public']['Tables']['campaigns']['Insert'];
type CampaignStatus = Database['public']['Enums']['campaign_status'];

export default function CampaignsView() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
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
    setIsModalOpen(false);
    resetForm();
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    
    if (!formData.name?.trim()) {
      setError('Campaign name is required.');
      return;
    }

    setIsLoading(true);

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
      setError(message);
      console.error('Error saving campaign:', message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="w-full h-full">
      {/* The bento box styling (padding, bg, shadow, rounded) is now handled by MainAppShell */}
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Campaigns</h1>
        <button className="btn btn-primary" onClick={() => handleOpenModal()}>
          Create Campaign
        </button>
      </div>

      {error && <div className="alert alert-error mb-4"><span>{error}</span></div>}

      <div className="overflow-x-auto bg-base-200 rounded-box">
        <table className="table w-full">
          <thead>
            <tr>
              <th>Name</th>
              <th>Status</th>
              <th>Created</th>
              <th>Last Updated</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={5} className="text-center py-10"><span className="loading loading-spinner"></span></td></tr>
            ) : campaigns.length > 0 ? (
              campaigns.map((campaign) => (
                <tr key={campaign.id} className="hover">
                  <td className="font-medium">{campaign.name}</td>
                  <td>
                    <span className={`badge ${
                      {
                        active: 'badge-success',
                        paused: 'badge-warning',
                        completed: 'badge-info',
                        archived: 'badge-neutral',
                        draft: 'badge-ghost',
                      }[campaign.status] || 'badge-ghost'
                    }`}>
                      {campaign.status}
                    </span>
                  </td>
                  <td>{new Date(campaign.created_at).toLocaleDateString()}</td>
                  <td>{new Date(campaign.updated_at).toLocaleDateString()}</td>
                  <td>
                    <button className="btn btn-ghost btn-sm" onClick={() => handleOpenModal(campaign)}>Edit</button>
                  </td>
                </tr>
              ))
            ) : (
              <tr><td colSpan={5} className="text-center py-10">No campaigns found.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {isModalOpen && (
        <div className="modal modal-open">
          <div className="modal-box">
            <h3 className="font-bold text-lg mb-4">{editingId ? 'Edit Campaign' : 'Create New Campaign'}</h3>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="form-control">
                <label className="label" htmlFor="name"><span className="label-text">Campaign Name</span></label>
                <input id="name" name="name" type="text" value={formData.name || ''} onChange={(e) => setFormData(p => ({...p, name: e.target.value}))} className="input input-bordered w-full" required />
              </div>
              <div className="form-control">
                <label className="label" htmlFor="status"><span className="label-text">Status</span></label>
                <select id="status" name="status" value={formData.status || 'draft'} onChange={(e) => setFormData(p => ({...p, status: e.target.value as CampaignStatus}))} className="select select-bordered w-full">
                  <option value="draft">Draft</option>
                  <option value="active">Active</option>
                  <option value="paused">Paused</option>
                  <option value="completed">Completed</option>
                  <option value="archived">Archived</option>
                </select>
              </div>
              <div className="modal-action">
                <button type="button" className="btn btn-ghost" onClick={handleCloseModal} disabled={isLoading}>Cancel</button>
                <button type="submit" className={`btn btn-primary ${isLoading ? 'loading' : ''}`} disabled={isLoading}>
                  {isLoading ? 'Saving...' : 'Save Campaign'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}