'use client';

import { PlayCircle, StopCircle, Mail, AlertTriangle, Info, CheckCircle, RefreshCw, MapPin } from 'lucide-react';
import React, { useState, useEffect, useCallback, useRef, JSX } from 'react';

import { supabase } from '@/lib/supabase/client';
import { Database } from '@/types/supabase';

// Assuming _email_log is the primary source of real-time messages for now
type EmailLogEntry = Database['public']['Tables']['email_log']['Row'];

interface LogEntry {
  id: string;
  timestamp: string;
  message: string;
  type: 'info' | 'error' | 'success' | 'warning' | 'engine'; // Added 'engine' type
  data?: any; // Optional raw data from the log
}

type EngineStatus = 'idle' | 'starting' | 'running' | 'stopping' | 'stopped' | 'error' | 'test_sending';

interface TestEmailResponse {
  success: boolean;
  message?: string;
  error?: string;
  lead_id?: number;
  subject?: string;
}

interface StartCampaignResponse {
  success: boolean;
  message?: string;
  error?: string;
  attempted?: number;
  succeeded?: number;
  failed?: number;
  processing_errors?: any[];
}

interface StopCampaignResponse {
  success: boolean;
  message?: string;
  error?: string;
}

interface MarketRegion {
  id: string;
  name: string;
  normalized_name: string;
  lead_count: number;
}

const EngineControlView: React.FC = (): JSX.Element => {
  const [engineStatus, setEngineStatus] = useState<EngineStatus>('idle');
  const [marketRegion, setMarketRegion] = useState<string>('FLORIDA'); // For StartEngine
  const [marketRegionsList, setMarketRegionsList] = useState<MarketRegion[]>([]);
  const [selectedTestMarketRegion, setSelectedTestMarketRegion] = useState<string>('');
  const [isLoadingMarketRegions, setIsLoadingMarketRegions] = useState<boolean>(true);
  const [consoleLogs, setConsoleLogs] = useState<LogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const consoleEndRef = useRef<null | HTMLDivElement>(null);

  const addLog = useCallback((message: string, type: LogEntry['type'], data?: any) => {
    const newLog: LogEntry = {
      id: Date.now().toString() + Math.random().toString(36).substring(2, 9),
      timestamp: new Date().toISOString(),
      message,
      type,
      data,
    };
    setConsoleLogs(prevLogs => [newLog, ...prevLogs.slice(0, 199)]); // Keep max 200 logs
  }, []);

  // Scroll to bottom of console
  useEffect(() => {
    consoleEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [consoleLogs]);

  // Placeholder for initial engine status check (if needed)
  useEffect(() => {
    // You might want to fetch the current engine status from an RPC or a dedicated table on load
    addLog(' Engine Control Panel Initialized.', 'info');
    // Example: async function fetchEngineStatus() { ... setEngineStatus ... } 
    // void fetchEngineStatus();

    // Fetch market regions for the test email selector
    const fetchMarketRegionsForTest = async () => {
      addLog('Fetching market regions for test email selector...', 'info');
      setIsLoadingMarketRegions(true);
      try {
        const response = await fetch('/api/market-regions');
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({})); // Try to parse error, default to empty obj
          throw new Error(errorData.error || `Failed to fetch market regions: ${response.statusText}`);
        }
        const data: MarketRegion[] | { error: string } = await response.json();
        if ('error' in data) {
          throw new Error((data as { error: string }).error);
        }
        setMarketRegionsList(data as MarketRegion[]);
        if ((data as MarketRegion[]).length > 0) {
          setSelectedTestMarketRegion((data as MarketRegion[])[0].normalized_name); // Default to first region
          addLog(`Market regions loaded. Default test region: ${(data as MarketRegion[])[0].name}`, 'info');
        } else {
          addLog('No market regions found.', 'warning');
        }
      } catch (err: any) {
        addLog(`Error fetching market regions: ${err.message}`, 'error');
        setError(`Failed to load market regions: ${err.message}`);
      } finally {
        setIsLoadingMarketRegions(false);
      }
    };
    void fetchMarketRegionsForTest();
  }, [addLog]);

  // Real-time subscription to _email_log for console updates
  useEffect(() => {
    const engineLogChannelName = 'engine-realtime-log-channel';
    const subscription = supabase
      .channel(engineLogChannelName)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'email_log' }, // Listen to all changes for now
        (payload) => {
          const record = payload.new as EmailLogEntry;
          let message = ` Log (${payload.eventType}): `; 
          if (record && record.contact_email) {
            message += `Email to ${record.contact_email} - Status: ${record.email_status}`;
            if (record.email_error_message) message += `, Error: ${record.email_error_message}`;
          } else {
            message += JSON.stringify(payload.new);
          }
          addLog(message, 'engine', payload.new);
        }
      )
      .subscribe((status: string, err?: { message: string }) => {
        if (status === 'SUBSCRIBED') {
          addLog('Connected to  Engine real-time log stream.', 'success');
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          const errorMessage = ` Log Stream Error: ${err?.message || 'Unknown error'}`;
          addLog(errorMessage, 'error');
          setError(errorMessage);
        }
      });

    return () => {
      addLog('Disconnecting from  Engine log stream...', 'info');
      if (subscription) void supabase.removeChannel(subscription);
    };
  }, [addLog]);

  const handleSendTestEmail = async () => {
    if (!selectedTestMarketRegion) {
      addLog('Please select a market region for the test email.', 'warning');
      setError('A market region must be selected to send a test email.');
      return;
    }
    addLog('Sending request to /api/-engine/test-email...', 'info');
    setIsLoading(true);
    setEngineStatus('test_sending');
    setError(null);

    try {
      const response = await fetch('/api/engine/test-email', { // Corrected API path
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ marketRegionNormalizedName: selectedTestMarketRegion }),
      });

      const result: TestEmailResponse = await response.json();

      if (!response.ok) {
        throw new Error(result.error || `API request failed with status ${response.status}`);
      }

      if (result.success) {
        addLog(`Test email API success: ${result.message}`, 'success');
        if (result.lead_id) {
            addLog(`Test email processed for lead ID: ${result.lead_id}, Subject: "${result.subject}"`, 'info');
        }
      } else {
        throw new Error(result.error || 'Test email API returned success:false');
      }
    } catch (error: unknown) {
      if (error instanceof Error) {
        const errorMessage = error.message;
        addLog(`Error during test email: ${errorMessage}`, 'error');
        setError(errorMessage);
        setEngineStatus('error'); // Set status to error
      }
    } finally {
      setIsLoading(false);
      // Reset status to 'idle' only if not in an error state
      if (engineStatus !== 'error' && engineStatus === 'test_sending') { // ensure we only reset from test_sending
        setEngineStatus('idle');
      }
    }
  };

  const handleStartEngine = async () => {
    if (!marketRegion.trim()) {
      const msg = 'Market region cannot be empty.';
      addLog(msg, 'warning');
      setError(msg);
      return;
    }
    addLog(`Initiating  Engine start sequence for market region: ${marketRegion}...`, 'info');
    setIsLoading(true);
    setEngineStatus('starting');
    setError(null);

    try {
      // Step 1: Call resume-campaign
      addLog('Attempting to resume campaign processing flag...', 'info');
      const resumeResponse = await fetch('/api/-engine/resume-campaign', { method: 'POST' });
      const resumeResult = await resumeResponse.json();

      if (!resumeResponse.ok || !resumeResult.success) {
        throw new Error(resumeResult.error || `Failed to resume campaign flag (status ${resumeResponse.status})`);
      }
      addLog('Campaign processing flag successfully set to RESUMED.', 'success');

      // Step 2: Call start-campaign
      addLog(`Sending request to /api/-engine/start-campaign for market: ${marketRegion}...`, 'info');
      const startResponse = await fetch('/api/-engine/start-campaign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ market_region: marketRegion /*, limit_per_run: 10 */ }), // limit_per_run is optional
      });
      const startResult: StartCampaignResponse = await startResponse.json();

      if (!startResponse.ok) {
        throw new Error(startResult.error || `API request to start-campaign failed with status ${startResponse.status}`);
      }

      if (startResult.success) {
        addLog(`Start campaign API success: ${startResult.message}`, 'success');
        addLog(`Batch details: Attempted: ${startResult.attempted}, Succeeded: ${startResult.succeeded}, Failed: ${startResult.failed}`, 'info');
        if (startResult.processing_errors && startResult.processing_errors.length > 0) {
            addLog(`Encountered ${startResult.processing_errors.length} errors during batch processing. Check logs.`, 'warning', startResult.processing_errors);
        }
        setEngineStatus('running'); // Reflects that a batch was started
      } else {
        throw new Error(startResult.error || 'Start campaign API returned success:false');
      }
    } catch (error: unknown) {
      if (error instanceof Error) {
        const errorMessage = error.message;
        addLog(`Error during engine start sequence: ${errorMessage}`, 'error');
        setError(errorMessage);
        setEngineStatus('error');
      }
    } finally {
      setIsLoading(false);
      // Do not reset to 'idle' here if it successfully started a batch ('running') or errored out.
    }
  };

  const handleStopEngine = async () => {
    addLog('Sending request to /api/-engine/stop-campaign...', 'info');
    setIsLoading(true);
    setEngineStatus('stopping');
    setError(null);
    try {
      const response = await fetch('/api/-engine/stop-campaign', { method: 'POST' });
      const result: StopCampaignResponse = await response.json();

      if (!response.ok) {
        throw new Error(result.error || `API request to stop-campaign failed with status ${response.status}`);
      }

      if (result.success) {
        addLog(`Stop campaign API success: ${result.message}`, 'success');
        setEngineStatus('stopped'); 
      } else {
        throw new Error(result.error || 'Stop campaign API returned success:false');
      }
    } catch (error: unknown) {
      if (error instanceof Error) {
        const errorMessage = error.message;
        addLog(`Error stopping engine: ${errorMessage}`, 'error');
        setError(errorMessage);
        setEngineStatus('error'); 
      }
    } finally {
      setIsLoading(false);
      // If it's not an error, it should be 'stopped'. If error, it's 'error'.
      // No automatic reset to 'idle'.
    }
  };

  const handleRefreshLogs = async (): Promise<void> => {
    try {
      addLog('Refreshing logs...', 'info');
      // Add log refresh implementation here
    } catch (error: unknown) {
      if (error instanceof Error) {
        console.error('Refresh error:', error.message);
      }
    }
  };

  const handleStartClick = async (): Promise<void> => {
    try {
      await handleStartEngine();
    } catch (error: unknown) {
      if (error instanceof Error) {
        console.error('Error starting engine:', error.message);
      }
    }
  };

  const handleTestEmailClick = async (): Promise<void> => {
    try {
      await handleSendTestEmail();
    } catch (error: unknown) {
      if (error instanceof Error) {
        console.error('Error sending test email:', error.message);
      }
    }
  };

  const handleStopClick = async (): Promise<void> => {
    try {
      await handleStopEngine();
    } catch (error: unknown) {
      if (error instanceof Error) {
        console.error('Error stopping engine:', error.message);
      }
    }
  };

  const handleRefreshClick = async (): Promise<void> => {
    try {
      await handleRefreshLogs();
    } catch (error: unknown) {
      if (error instanceof Error) {
        console.error('Error refreshing logs:', error.message);
      }
    }
  };

  const getStatusColor = (status: EngineStatus): string => {
    switch (status) {
      case 'running': return 'text-success';
      case 'stopped':
      case 'idle': return 'text-info';
      case 'error': return 'text-error';
      case 'starting':
      case 'stopping':
      case 'test_sending': return 'text-warning';
      default: return 'text-neutral-content';
    }
  };

  return (
    <div className="p-4 md:p-6 min-h-screen bg-base-200">
      <h1 className="text-3xl font-bold mb-6 text-center"> Engine Control Panel</h1>

      {error && (
        <div className="alert alert-error mb-4">
          <AlertTriangle className="h-5 w-5" />
          <span>{error}</span>
        </div>
      )}

      <div className="card bordered shadow-lg bg-base-100 mb-6">
        <div className="card-body p-4">
          <div className="flex flex-col sm:flex-row justify-between items-center mb-4">
            <h2 className="text-xl font-semibold">Engine Status: <span className={`font-bold ${getStatusColor(engineStatus)}`}>{engineStatus.toUpperCase()}</span></h2>
            <div className="form-control w-full sm:w-auto mt-3 sm:mt-0">
              <label className="label" htmlFor="marketRegionInput">
                <span className="label-text flex items-center"><MapPin size={16} className="mr-1" /> Market Region</span>
              </label>
              <input 
                id="marketRegionInput"
                type="text" 
                placeholder="e.g., Austin" 
                value={marketRegion}
                onChange={(e) => setMarketRegion(e.target.value.toUpperCase())}
                className="input input-bordered w-full sm:w-auto"
                disabled={isLoading && (engineStatus === 'starting' || engineStatus === 'running')}
              />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="flex flex-col space-y-2">
              <div>
                <label htmlFor="testMarketRegionSelect" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Test Email Market Region:
                </label>
                {isLoadingMarketRegions ? (
                  <p className="text-sm text-gray-500 dark:text-gray-400">Loading regions...</p>
                ) : marketRegionsList.length > 0 ? (
                  <select 
                    id="testMarketRegionSelect"
                    value={selectedTestMarketRegion}
                    onChange={(e) => setSelectedTestMarketRegion(e.target.value)}
                    disabled={isLoading || engineStatus === 'test_sending' || engineStatus === 'running'}
                    className="select select-bordered select-sm w-full max-w-xs dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                  >
                    {marketRegionsList.map((region) => (
                      <option key={region.id} value={region.normalized_name}>
                        {region.name} ({region.lead_count} leads)
                      </option>
                    ))}
                  </select>
                ) : (
                  <p className="text-sm text-red-500 dark:text-red-400">No market regions loaded.</p>
                )}
              </div>
              <button 
                onClick={handleSendTestEmail} 
                disabled={isLoading || engineStatus === 'running' || engineStatus === 'starting' || engineStatus === 'stopping' || engineStatus === 'test_sending' || isLoadingMarketRegions || !selectedTestMarketRegion}
                className="btn btn-warning btn-sm shadow-md hover:shadow-lg transition-shadow duration-150 ease-in-out flex items-center space-x-2 self-start"
              >
                <Mail size={18} />
                <span>Send Test Email</span>
              </button>
            </div>
            <button 
              className="btn btn-success" 
              onClick={handleStartClick}
              disabled={(isLoading && engineStatus !== 'starting') || engineStatus === 'running' || !marketRegion.trim()}
            >
              {isLoading && engineStatus === 'starting' ? (
                <span className="loading loading-spinner loading-xs"></span>
              ) : (
                <PlayCircle className="mr-2 h-5 w-5" />
              )}
              Start Engine
            </button>
            <button 
              className="btn btn-error" 
              onClick={handleStopClick}
              disabled={(isLoading && engineStatus !== 'stopping') || engineStatus === 'idle' || engineStatus === 'stopped'}
            >
              {isLoading && engineStatus === 'stopping' ? (
                <span className="loading loading-spinner loading-xs"></span>
              ) : (
                <StopCircle className="mr-2 h-5 w-5" />
              )}
              Stop Engine
            </button>
          </div>
        </div>
      </div>

      <div className="card bordered shadow-lg bg-base-100">
        <div className="card-body p-4">
          <h2 className="text-xl font-semibold mb-3">Real-time Engine Log</h2>
          <div className="h-96 overflow-y-auto bg-neutral text-neutral-content p-3 rounded-md text-sm font-mono">
            {consoleLogs.length === 0 && <p>No log messages yet. Waiting for  Engine activity...</p>}
            {consoleLogs.map(log => (
              <div key={log.id} className={`whitespace-pre-wrap ${log.type === 'error' ? 'text-red-400' : log.type === 'success' ? 'text-green-400' : log.type === 'warning' ? 'text-yellow-400' : ''}`}>
                <span className="text-gray-500">{new Date(log.timestamp).toLocaleTimeString()} | </span>
                <span>{log.message}</span>
                {log.data && <details className="text-xs text-gray-600"><summary>Raw Data</summary><pre>{JSON.stringify(log.data, null, 2)}</pre></details>}
              </div>
            ))}
            <div ref={consoleEndRef} />
          </div>
        </div>
      </div>
    </div>
  );
};

export default EngineControlView;
