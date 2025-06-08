import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase/client';
import type { Campaign, CampaignJobs, CampaignJobStatus } from '@/types';

function isJobStatus(status: string): status is CampaignJobStatus {
    // Check against the values of the CampaignJobStatus enum
    return Object.values(CampaignJobStatus).includes(status as CampaignJobStatus);
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
      
      const typedData = (data || []).map(job => {
        if (!isJobStatus(job.status)) {
          console.warn(`Invalid job status: ${job.status}, defaulting to 'scheduled'`);
          return { ...job, status: CampaignJobStatus.Scheduled };
        }
        return { ...job, status: job.status as CampaignJobStatus };
      });
      
      setJobs(typedData as CampaignJobs[]);
      return typedData as CampaignJobs[];
    } catch (err) {
      setError('Failed to load jobs');
      console.error('Error fetching jobs:', err);
      return [] as CampaignJobs[];
    } finally {
      setIsLoading(false);
    }
  }, []);

  return {
    campaigns,
    jobs,
    isLoading,
    error,
    fetchCampaigns,
    fetchJobs,
  };
}