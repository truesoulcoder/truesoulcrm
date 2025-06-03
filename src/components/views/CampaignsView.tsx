"use client";

import { createBrowserClient } from '@supabase/ssr';
import { format } from 'date-fns';
import { useState, useEffect, useCallback } from 'react';

import { Database } from '@/db_types';


// DaisyUI components are available globally, no need to import

type Campaign = Database['public']['Tables']['campaigns']['Row'];
type MarketRegion = { name: string }; // Changed from market_region to name

export default function CampaignsView() {
  const supabase = createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [marketRegions, setMarketRegions] = useState<MarketRegion[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState<Partial<Campaign>>({
    name: '',
    description: '',
    status: 'draft',
    is_active: true,
    daily_limit: 100,
    market_region: '',
    sender_quota: 10,
    min_interval_seconds: 180,
    max_interval_seconds: 360,
    dry_run: false,
  });
  const [editingId, setEditingId] = useState<string | null>(null);

  const fetchCampaigns = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('campaigns')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setCampaigns(data || []);
    } catch (error) {
      console.error('Error fetching campaigns:', error);
    }
  }, [supabase]);

  const fetchMarketRegions = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('market_regions')
        .select('name') // Select the 'name' column
        .order('name'); // Order by 'name'

      if (error) throw error;
      // Map the data to the expected MarketRegion type
      const regions = data.map((item: { name: string | null }) => ({
        name: item.name || '' // Use item.name
      })).filter(region => region.name); // Filter out any empty names
      setMarketRegions(regions);
    } catch (error) {
      console.error('Error fetching market regions:', error);
    }
  }, [supabase]);

  useEffect(() => {
    const loadData = async () => {
      try {
        await fetchCampaigns();
        await fetchMarketRegions();
      } catch (error) {
        console.error('Error loading data:', error);
        // TODO: Add error handling (e.g., show error toast)
      }
    };
    
    void loadData();
  }, [fetchCampaigns, fetchMarketRegions]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target as HTMLInputElement;
    
    setFormData(prev => ({
      ...prev,
      [name]: type === 'number' ? parseInt(value) || 0 : value
    }));
  };

  const handleSelectChange = (name: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleCheckboxChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: checked
    }));
  };

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      status: 'draft',
      is_active: true,
      daily_limit: 100,
      market_region: '',
      sender_quota: 10,
      min_interval_seconds: 180,
      max_interval_seconds: 360,
      dry_run: false,
    });
    setEditingId(null);
  };

  const handleOpenModal = (campaign?: Campaign) => {
    if (campaign) {
      setFormData({
        ...campaign,
        daily_limit: campaign.daily_limit || 100,
        sender_quota: campaign.sender_quota || 10,
        min_interval_seconds: campaign.min_interval_seconds || 180,
        max_interval_seconds: campaign.max_interval_seconds || 360,
      });
      setEditingId(campaign.id);
    } else {
      resetForm();
    }
    setIsModalOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const submitForm = async () => {
      // Ensure all required fields are present
      const requiredFields = ['name', 'description', 'market_region', 'daily_limit', 
                            'sender_quota', 'min_interval_seconds', 'max_interval_seconds'] as const;
      
      const missingFields = requiredFields.filter(field => {
        const value = formData[field];
        return value === undefined || value === null || value === '';
      });
      
      if (missingFields.length > 0) {
        alert(`Please fill in all required fields: ${missingFields.join(', ')}`);
        return;
      }
      
      // Type assertion since we've checked for undefined above
      const minInterval = formData.min_interval_seconds!;
      const maxInterval = formData.max_interval_seconds!;
      
      if (minInterval >= maxInterval) {
        alert('Minimum interval must be less than maximum interval');
        return;
      }

      setIsLoading(true);

      try {
        // Create a new type that matches our form data structure
        type CampaignFormData = Omit<Campaign, 'id' | 'created_at' | 'updated_at'> & {
          id?: string;
          created_at?: string | null;
          updated_at: string;
        };
        
        const campaignData: CampaignFormData = {
          ...formData,
          name: formData.name!,
          description: formData.description!,
          market_region: formData.market_region!,
          daily_limit: formData.daily_limit!,
          sender_quota: formData.sender_quota!,
          min_interval_seconds: formData.min_interval_seconds!,
          max_interval_seconds: formData.max_interval_seconds!,
          status: formData.status || 'draft',
          is_active: formData.is_active ?? true,
          dry_run: formData.dry_run ?? false,
          updated_at: new Date().toISOString(),
        };

        if (editingId) {
          // Update existing campaign
          const { error } = await supabase
            .from('campaigns')
            .update(campaignData)
            .eq('id', editingId);

          if (error) throw error;
        } else {
          // Create new campaign
          const { error } = await supabase
            .from('campaigns')
            .insert([campaignData as any]);

          if (error) throw error;
        }


        await fetchCampaigns();
        setIsModalOpen(false);
        resetForm();
      } catch (error) {
        console.error('Error saving campaign:', error);
        alert('Failed to save campaign');
      } finally {
        setIsLoading(false);
      }
    };
    
    // Call the async function
    void submitForm();
  };

  return (
    <div className="container mx-auto p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Campaigns</h1>
        <button 
          className="btn btn-primary" 
          onClick={() => handleOpenModal()}
        >
          Create Campaign
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="table w-full">
          <thead>
            <tr>
              <th>Name</th>
              <th>Status</th>
              <th>Market Region</th>
              <th>Daily Limit</th>
              <th>Created</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {campaigns.map((campaign) => (
              <tr key={campaign.id} className="hover:bg-base-200">
                <td>{campaign.name}</td>
                <td>
                  <span className={`badge ${
                    campaign.status === 'active' ? 'badge-success' : 
                    campaign.status === 'paused' ? 'badge-warning' : 
                    'badge-neutral'
                  }`}>
                    {campaign.status}
                  </span>
                </td>
                <td>{campaign.market_region}</td>
                <td>{campaign.daily_limit}</td>
                <td>{campaign.created_at ? new Date(campaign.created_at).toLocaleDateString() : 'N/A'}</td>
                <td>
                  <button 
                    className="btn btn-ghost btn-sm"
                    onClick={() => handleOpenModal(campaign)}
                  >
                    Edit
                  </button>
                </td>
              </tr>
            ))}
            {campaigns.length === 0 && (
              <tr>
                <td colSpan={6} className="text-center py-4">
                  No campaigns found. Create your first campaign to get started.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Modal */}
      <div className={`modal ${isModalOpen ? 'modal-open' : ''}`}>
        <div className="modal-box max-w-3xl">
          <h3 className="font-bold text-lg mb-4">
            {editingId ? 'Edit Campaign' : 'Create New Campaign'}
          </h3>
          <p className="text-sm text-gray-500 mb-6">
            {editingId ? 'Update the campaign details below.' : 'Fill out the form to create a new campaign.'}
          </p>
          
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="form-control">
              <label className="label" htmlFor="name">
                <span className="label-text">Name <span className="text-error">*</span></span>
              </label>
              <input
                id="name"
                name="name"
                type="text"
                value={formData.name || ''}
                onChange={handleInputChange}
                className="input input-bordered w-full"
                required
              />
            </div>

            <div className="form-control">
              <label className="label" htmlFor="description">
                <span className="label-text">Description <span className="text-error">*</span></span>
              </label>
              <textarea
                id="description"
                name="description"
                value={formData.description || ''}
                onChange={handleInputChange}
                className="textarea textarea-bordered h-24"
                required
              />
            </div>

            <div className="form-control">
              <label className="label" htmlFor="market_region">
                <span className="label-text">Market Region <span className="text-error">*</span></span>
              </label>
              <select
                id="market_region"
                name="market_region"
                value={formData.market_region || ''}
                onChange={(e) => handleSelectChange('market_region', e.target.value)}
                className="select select-bordered w-full"
                required
              >
                <option value="">Select a market region</option>
                {marketRegions.map((region) => (
                  <option key={region.name} value={region.name}>
                    {region.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-control">
              <label className="label" htmlFor="status">
                <span className="label-text">Status</span>
              </label>
              <select
                id="status"
                name="status"
                value={formData.status || 'draft'}
                onChange={(e) => handleSelectChange('status', e.target.value)}
                className="select select-bordered w-full"
              >
                <option value="draft">Draft</option>
                <option value="active">Active</option>
                <option value="paused">Paused</option>
                <option value="completed">Completed</option>
              </select>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="form-control">
                <label className="label" htmlFor="daily_limit">
                  <span className="label-text">Daily Limit <span className="text-error">*</span></span>
                </label>
                <input
                  id="daily_limit"
                  name="daily_limit"
                  type="number"
                  min="1"
                  value={formData.daily_limit || ''}
                  onChange={handleInputChange}
                  className="input input-bordered w-full"
                  required
                />
              </div>

              <div className="form-control">
                <label className="label" htmlFor="sender_quota">
                  <span className="label-text">Sender Quota <span className="text-error">*</span></span>
                </label>
                <input
                  id="sender_quota"
                  name="sender_quota"
                  type="number"
                  min="1"
                  value={formData.sender_quota || ''}
                  onChange={handleInputChange}
                  className="input input-bordered w-full"
                  required
                />
              </div>

              <div className="form-control">
                <label className="label" htmlFor="min_interval_seconds">
                  <span className="label-text">Min Interval (s) <span className="text-error">*</span></span>
                </label>
                <input
                  id="min_interval_seconds"
                  name="min_interval_seconds"
                  type="number"
                  min="1"
                  value={formData.min_interval_seconds || ''}
                  onChange={handleInputChange}
                  className="input input-bordered w-full"
                  required
                />
              </div>

              <div className="form-control">
                <label className="label" htmlFor="max_interval_seconds">
                  <span className="label-text">Max Interval (s) <span className="text-error">*</span></span>
                </label>
                <input
                  id="max_interval_seconds"
                  name="max_interval_seconds"
                  type="number"
                  min="1"
                  value={formData.max_interval_seconds || ''}
                  onChange={handleInputChange}
                  className="input input-bordered w-full"
                  required
                />
              </div>
            </div>

            <div className="form-control mt-4">
              <label className="label cursor-pointer justify-start gap-2">
                <input
                  id="dry_run"
                  name="dry_run"
                  type="checkbox"
                  checked={formData.dry_run || false}
                  onChange={handleCheckboxChange}
                  className="checkbox"
                />
                <span className="label-text">Enable dry run mode (no emails will be sent)</span>
              </label>
            </div>

            <div className="modal-action">
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => {
                  setIsModalOpen(false);
                  resetForm();
                }}
                disabled={isLoading}
              >
                Cancel
              </button>
              <button 
                type="submit" 
                className={`btn btn-primary ${isLoading ? 'loading' : ''}`}
                disabled={isLoading}
              >
                {isLoading ? 'Saving...' : 'Save Campaign'}
              </button>
            </div>
          </form>
        </div>
        
        {/* Click outside to close */}
        <form method="dialog" className="modal-backdrop">
          <button onClick={() => {
            setIsModalOpen(false);
            resetForm();
          }}>close</button>
        </form>
      </div>
    </div>
  );
}
