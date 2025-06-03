import { useState, useEffect, useCallback } from 'react';

import { supabase } from '@/lib/supabase/client';
import { Campaign, CampaignJobs, JobStatus } from '@/types/campaign';

function isJobStatus(status: string): status is JobStatus {
  return ['pending', 'processing', 'completed', 'failed'].includes(status);
}

export function useCampaigns() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [jobs, setJobs] = useState<CampaignJobs[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchCampaigns = useCallback(async (): Promise<Campaign[]> => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('campaigns')
        .select('*')
        .order('created_at', { ascending: false })
        .returns<Campaign[]>();

      if (error) throw error;
      setCampaigns(data || []);
      return data || [];
    } catch (err: any) {
      const errorMessage: string = err?.message || 'Failed to load campaigns';
      setError(errorMessage);
      console.error('Error fetching campaigns:', err);
      return [];
    } finally {
      setIsLoading(false);
    }
  }, []);

// In your useCampaigns.ts file, modify the fetchJobs function like this:

const fetchJobs = useCallback(async (campaignId: string) => {
  if (!campaignId) return [];
  
  setIsLoading(true);
  try {
    const { data, error } = await supabase
      .from('campaign_jobs')
      .select('*')
      .eq('campaign_id', campaignId)
      .order('next_processing_time', { ascending: true });

    if (error) throw error;
    
    // Use the type guard to validate status
    const typedData = (data || []).map(job => {
      if (!isJobStatus(job.status)) {
        console.warn(`Invalid job status: ${job.status}, defaulting to 'pending'`);
        return { ...job, status: 'pending' as const };
      }
      return { ...job, status: job.status };
    });
    
    setJobs(typedData);
    return typedData;
  } catch (err) {
    setError('Failed to load jobs');
    console.error('Error fetching jobs:', err);
    return [] as CampaignJobs[];
  } finally {
    setIsLoading(false);
  }
}, []);
  // Add other shared methods like startCampaign, stopCampaign, etc.

  return {
    campaigns,
    jobs,
    isLoading,
    error,
    fetchCampaigns,
    fetchJobs,
    // Add other methods
  };
}