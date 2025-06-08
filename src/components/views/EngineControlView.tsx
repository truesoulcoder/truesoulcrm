'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase/client';
import { Play, Pause, RefreshCw, AlertTriangle, List, Activity } from 'lucide-react';
import type { Database } from '@/types';

// Define types for state management
type Campaign = Database['public']['Tables']['campaigns']['Row'];
type CampaignState = Database['public']['Tables']['campaign_engine_state']['Row'];
type JobLog = Database['public']['Tables']['job_logs']['Row'];
type CampaignStatus = 'running' | 'paused' | 'stopped';

// UI Component for individual Bento boxes
const BentoBox = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => (
  <div className={`card bg-base-200 shadow-md p-4 md:p-6 ${className}`}>
    {children}
  </div>
);

const EngineControlView = () => {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [engineStates, setEngineStates] = useState<Map<string, CampaignState>>(new Map());
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null);
  const [logs, setLogs] = useState<JobLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const [selectedStatus, setSelectedStatus] = useState<CampaignStatus>('stopped');

  // Fetch initial data
  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const { data: campaignsData, error: campaignsError } = await supabase.from('campaigns').select('*').order('created_at', { ascending: false });
      if (campaignsError) throw campaignsError;
      setCampaigns(campaignsData || []);

      const { data: statesData, error: statesError } = await supabase.from('campaign_engine_state').select('*');
      if (statesError) throw statesError;
      const statesMap = new Map((statesData || []).map(state => [state.campaign_id, state]));
      setEngineStates(statesMap);

      if (campaignsData && campaignsData.length > 0 && !selectedCampaignId) {
        setSelectedCampaignId(campaignsData[0].id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "An unknown error occurred.");
    } finally {
      setIsLoading(false);
    }
  }, [selectedCampaignId]);

  // Fetch logs for the selected campaign
  const fetchLogs = useCallback(async (campaignId: string) => {
    if (!campaignId) {
      setLogs([]);
      return;
    }
    const { data, error } = await supabase
        .from('job_logs')
        .select('*')
        .eq('job_id', campaignId) // This is incorrect, should be by campaign_id on the job
        .order('created_at', { ascending: false })
        .limit(100);

    if (error) {
        console.error("Error fetching logs:", error);
        setError("Failed to fetch logs.");
    } else {
        setLogs(data || []);
    }
  }, []);

  // Initial data fetch
  useEffect(() => {
    fetchData();
  }, []); // Note: intentionally not including fetchData to run only once

  // Fetch logs when selected campaign changes
  useEffect(() => {
    if (selectedCampaignId) {
      fetchLogs(selectedCampaignId);
    }
  }, [selectedCampaignId, fetchLogs]);

  // Set up Supabase Realtime subscriptions
  useEffect(() => {
    const stateChannel = supabase
      .channel('campaign-engine-state-changes')
      .on<CampaignState>('postgres_changes', { event: '*', schema: 'public', table: 'campaign_engine_state' },
        payload => {
          const newState = payload.new;
          setEngineStates(prev => new Map(prev).set(newState.campaign_id, newState));
          setSelectedStatus(newState.status as CampaignStatus);
        }
      ).subscribe();
    
    // Targeted subscription for logs of the selected campaign
    const logChannel = supabase
        .channel('job-log-changes')
        .on<JobLog>('postgres_changes', { event: 'INSERT', schema: 'public', table: 'job_logs' },
            payload => {
                if (selectedCampaignId && payload.new.campaign_id === selectedCampaignId) {
                    // Option 1: Just append the new log if we have logs state
                    // setLogs(prev => [...prev, payload.new]);
                    
                    // Option 2: Refetch logs to ensure consistency
                    fetchLogs(selectedCampaignId);
                }
            }
        ).subscribe();

    return () => {
      supabase.removeChannel(stateChannel);
      supabase.removeChannel(logChannel);
    };
  }, [selectedCampaignId, fetchLogs]);


  // Handle campaign actions
  const handleCampaignAction = async (endpoint: string, campaignId: string | null) => {
    if (!campaignId) return;
    setActionLoading(true);
    try {
      const response = await fetch(`/api/engine/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaign_id: campaignId }),
      });
      if (!response.ok) {
        const { error } = await response.json();
        throw new Error(error || 'Action failed');
      }
      // UI will update via realtime subscription
    } catch (err) {
      setError(err instanceof Error ? err.message : "An unknown error occurred.");
    } finally {
      setActionLoading(false);
    }
  };

  if (isLoading) {
    return <div className="flex justify-center items-center h-full"><span className="loading loading-spinner loading-lg"></span></div>;
  }
  
  if (error) {
    return <div className="alert alert-error"><AlertTriangle className="mr-2"/><span>{error}</span></div>;
  }
  
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6 h-full">
      {/* Left Panel: Controls */}
      <div className="lg:col-span-1 flex flex-col gap-4 md:gap-6">
        <BentoBox>
            <h2 className="card-title text-base-content/80 mb-2">
                <List className="w-5 h-5"/>
                Select Campaign
            </h2>
            <select
              className="select select-bordered w-full"
              value={selectedCampaignId || ''}
              onChange={(e) => setSelectedCampaignId(e.target.value)}
              disabled={campaigns.length === 0}
            >
              {campaigns.length > 0 ? (
                campaigns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)
              ) : (
                <option>No campaigns found</option>
              )}
            </select>
        </BentoBox>
        <BentoBox className="flex-grow flex flex-col justify-between">
            <div>
                <h2 className="card-title text-base-content/80 mb-2">
                    <Activity className="w-5 h-5"/>
                    Campaign Status
                </h2>
                <div className={`badge badge-lg w-full h-12 text-xl ${
                    {running: 'badge-success', paused: 'badge-warning', stopped: 'badge-error'}[selectedStatus] || 'badge-ghost'
                }`}>
                    {selectedStatus.toUpperCase()}
                </div>
            </div>
            <div className="card-actions justify-center gap-2 mt-4">
              <button className="btn btn-success" onClick={() => handleCampaignAction('start-campaign', selectedCampaignId)} disabled={actionLoading || selectedStatus === 'running' || !selectedCampaignId}><Play/>Start</button>
              <button className="btn btn-warning" onClick={() => handleCampaignAction('stop-campaign', selectedCampaignId)} disabled={actionLoading || selectedStatus !== 'running' || !selectedCampaignId}><Pause/>Pause</button>
              <button className="btn btn-info" onClick={() => handleCampaignAction('resume-campaign', selectedCampaignId)} disabled={actionLoading || selectedStatus !== 'paused' || !selectedCampaignId}><RefreshCw/>Resume</button>
            </div>
        </BentoBox>
      </div>

      {/* Right Panel: Logs */}
      <BentoBox className="lg:col-span-2 min-h-[30rem] flex flex-col">
          <h2 className="card-title text-base-content/80 mb-4">Job Logs</h2>
          <div className="bg-base-100 p-2 rounded-lg flex-grow overflow-y-auto">
              {logs.length > 0 ? (
                  logs.map(log => (
                      <div key={log.id} className="font-mono text-xs p-1 border-b border-base-300/50">
                          <span className="text-info/70 mr-2">{new Date(log.created_at).toLocaleString()}</span>
                          <span>{log.log_message}</span>
                      </div>
                  ))
              ) : (
                  <p className="text-center text-base-content/50 pt-10">No logs for selected campaign.</p>
              )}
          </div>
      </BentoBox>
    </div>
  );
};

export default EngineControlView;