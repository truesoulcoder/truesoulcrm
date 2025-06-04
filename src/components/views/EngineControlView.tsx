'use client';

import { PlayCircle, StopCircle, Mail, AlertTriangle, Info, CheckCircle, RefreshCw, MapPin } from 'lucide-react';
import React, { useState, useEffect, useCallback, useRef, JSX } from 'react';

import { supabase } from '@/lib/supabase/client';
import { Database } from '@/types/supabase';
import TimePicker from '@/components/ui/TimePicker'; // Added import for TimePicker

const MAX_DISPLAY_LOGS = 10;

// Assuming engine_log is the primary source of real-time messages for now
type EngineLogEntry = Database['public']['Tables']['engine_log']['Row'];

interface LogEntry {
  id: string;
  timestamp: string;
  message: string;
  type: 'info' | 'error' | 'success' | 'warning' | 'engine';
  data?: Record<string, unknown>;
}

interface EngineLogTablePayload {
  id: number;
  processed_at: string | null; // Changed from timestamp to processed_at
  message: string;
  type: LogEntry['type'];
  data?: Record<string, unknown>;
}

type EngineStatus = 'idle' | 'starting' | 'running' | 'stopping' | 'stopped' | 'error' | 'test_sending';

interface TestEmailResponse {
  success: boolean;
  messageId?: string; // send-email route returns messageId
  message?: string; // General message, can be kept for broader compatibility or if send-email also returns it
  error?: string;
  // lead_id and subject are not directly returned by send-email, they are logged server-side
}

interface StartCampaignResponse {
  success: boolean;
  message?: string;
  error?: string;
  attempted?: number;
  succeeded?: number;
  failed?: number;
  processing_errors?: string[];
}

interface ResumeCampaignResponse {
  success: boolean;
  message?: string;
  error?: string; // Assuming error is a string, similar to other responses
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

// Type for campaign dropdown
type CampaignSelectItem = {
  id: string; // uuid
  name: string;
};

const EngineControlView: React.FC = (): JSX.Element => {
  const [engineStatus, setEngineStatus] = useState<EngineStatus>('idle');
  const [marketRegionsList, setMarketRegionsList] = useState<MarketRegion[]>([]);
  const [selectedTestMarketRegion, setSelectedTestMarketRegion] = useState<string | undefined>('');
  const [isLoadingMarketRegions, setIsLoadingMarketRegions] = useState<boolean>(true);
  const [consoleLogs, setConsoleLogs] = useState<LogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const consoleEndRef = useRef<null | HTMLDivElement>(null);

  // State for campaign scheduler
  const [allCampaigns, setAllCampaigns] = useState<CampaignSelectItem[]>([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState<string>('');
  const [selectedInterval, setSelectedInterval] = useState<string>('01:00:00'); // Default to 1 hour, e.g.
  const [isScheduling, setIsScheduling] = useState<boolean>(false);

  // Fetch campaigns for dropdown
  useEffect(() => {
    const fetchCampaigns = async () => {
      setIsLoading(true);
      addLog('info', 'Fetching campaigns for scheduler...');
      const { data, error: campaignsError } = await supabase
        .from('campaigns')
        .select('id, name')
        .order('name', { ascending: true });

      if (campaignsError) {
        console.error('Error fetching campaigns:', campaignsError);
        addLog('error', `Error fetching campaigns: ${campaignsError.message}`);
        setError('Failed to load campaigns.');
      } else {
        setAllCampaigns(data as CampaignSelectItem[]);
        if (data.length > 0) {
          setSelectedCampaignId(data[0].id); // Select the first campaign by default
        }
        addLog('success', `Successfully fetched ${data.length} campaigns.`);
      }
      setIsLoading(false);
    };

    void fetchCampaigns();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Run once on mount

  // Real-time log updates from engine_log table
  useEffect(() => {
    const fetchInitialLogs = async () => {
      try {
        const { data, error } = await supabase
          .from('engine_log')
          .select('*')
          .order('processed_at', { ascending: true }) // Fetch oldest first for initial display
          .limit(50); // Fetch last 50 logs initially

        if (error) {
          console.error('Error fetching initial engine logs:', error);
          setConsoleLogs(prevLogs => [
            ...prevLogs,
            {
              id: `${Date.now().toString()}_fetch_error`,
              timestamp: new Date().toISOString(),
              message: `Error fetching initial logs: ${error.message}`,
              type: 'error'
            }
          ]);
          return;
        }

        if (data) {
          const formattedLogs: LogEntry[] = data.map((log: FetchedLogItem) => {
            let timestampStr: string;
            if (log.processed_at) {
              const dateObj = new Date(log.processed_at);
              if (isNaN(dateObj.getTime())) {
                console.warn(`Invalid date value for processed_at: '${log.processed_at}' (log ID: ${log.id}). Using current time as fallback.`);
                timestampStr = new Date().toISOString();
              } else {
                timestampStr = dateObj.toISOString();
              }
            } else {
              console.warn(`Null or undefined processed_at for log ID: ${log.id}. Using current time as fallback.`);
              timestampStr = new Date().toISOString();
            }

            const validLogTypes: ReadonlyArray<LogEntry['type']> = ['info', 'error', 'success', 'warning', 'engine'];
            let mappedType: LogEntry['type'] = 'engine'; // Default type
            if (log.log_level && validLogTypes.includes(log.log_level as LogEntry['type'])) {
              mappedType = log.log_level as LogEntry['type'];
            } else if (log.log_level) {
              // Log level exists but is not one of the predefined valid types
              console.warn(`Unknown log_level: '${log.log_level}' (log ID: ${log.id}). Defaulting to 'engine'.`);
            }

            let finalMessage: string;
            if (log.message === null || typeof log.message === 'undefined') {
              finalMessage = '';
            } else {
              finalMessage = String(log.message); // Ensure it's a string if not null/undefined
            }

            return {
              id: String(log.id), // Ensure ID is string
              timestamp: timestampStr,
              message: finalMessage, // Use the explicitly typed and processed string
              type: mappedType, // This should be correctly typed as LogEntry['type']
              data: log.data
            };
          }) as LogEntry[];
          setConsoleLogs(formattedLogs); // Set initial logs directly, replacing any previous ones
        }
      } catch (e: unknown) {
        console.error('Exception fetching initial logs:', e);
        setConsoleLogs(prevLogs => [
          ...prevLogs,
          {
            id: `${Date.now().toString()}_fetch_exception`,
            timestamp: new Date().toISOString(),
            message: `Exception fetching initial logs: ${e instanceof Error ? e.message : 'Unknown error'}`,
            type: 'error'
          }
        ]);
      }
    };

    void fetchInitialLogs();

    const channel = supabase
      .channel('engine_log_changes') // Unique channel name
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'engine_log' },
        (payload) => {
          console.log('New engine log received:', payload.new);
          const newRawLog = payload.new as EngineLogTablePayload; // Use specific type

          // Safe timestamp handling
          let timestampStr: string;
          try {
            // Use processed_at instead of timestamp
            if (newRawLog.processed_at) {
              const dateObj = new Date(newRawLog.processed_at);
              if (isNaN(dateObj.getTime())) {
                console.warn(`Invalid processed_at value: '${newRawLog.processed_at}' (log ID: ${newRawLog.id}). Using current time as fallback.`);
                timestampStr = new Date().toISOString();
              } else {
                timestampStr = dateObj.toISOString();
              }
            } else {
              console.warn(`Null or undefined processed_at for log ID: ${newRawLog.id}. Using current time as fallback.`);
              timestampStr = new Date().toISOString();
            }
          } catch (error) {
            console.error(`Error processing timestamp: ${error}. Using current time as fallback.`);
            timestampStr = new Date().toISOString();
          }

          const newLogEntry: LogEntry = {
            id: String(newRawLog.id),
            timestamp: timestampStr,
            message: newRawLog.message || '',
            type: newRawLog.type as LogEntry['type'],
            data: newRawLog.data,
          };
          // Append new log and then slice to keep only the last MAX_DISPLAY_LOGS
          setConsoleLogs((prevLogs) => {
            const updatedLogs = [...prevLogs, newLogEntry];
            return updatedLogs.slice(-MAX_DISPLAY_LOGS);
          });
        }
      )
      .subscribe((status, err) => {
        if (status === 'SUBSCRIBED') {
          console.log('Successfully subscribed to engine_log changes!');
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || err) { // Added TIMED_OUT
          console.error('Engine log subscription error. Status:', status, 'Error object:', err); // Log entire error object
          setConsoleLogs(prevLogs => {
            const newErrorLog: LogEntry = {
              id: `${Date.now().toString()}_sub_error`,
              timestamp: new Date().toISOString(),
              // Provide more detailed error in the UI log
              message: status === 'TIMED_OUT'
                ? `Log subscription timed out. Connection may attempt to re-establish. (Details: ${err ? JSON.stringify(err) : 'No additional error details'})`
                : `Log subscription error. Status: ${status}. Details: ${err ? JSON.stringify(err) : 'Unknown error'}`, 
              type: 'error'
            };
            const updatedLogs = [
              ...prevLogs,
              newErrorLog
            ];
            return updatedLogs.slice(-MAX_DISPLAY_LOGS);
          });
        }
      });

    // Cleanup function to remove the channel subscription when the component unmounts
    return () => {
      void supabase.removeChannel(channel);
    };
  }, []); // Empty dependency array, supabase client is stable

  const addLog = useCallback((type: LogEntry['type'], message: string, data?: Record<string, unknown>) => {
    setConsoleLogs(prevLogs => {
      const updatedLogs = [
        ...prevLogs,
        {
          id: `${Date.now().toString()}_${Math.random().toString(36).substring(7)}`,
          timestamp: new Date().toISOString(),
          message,
          type,
          data,
        }
      ];
      return updatedLogs.slice(-MAX_DISPLAY_LOGS);
    });
  }, []); // MAX_DISPLAY_LOGS is a constant, no need to add to deps

  // Scroll to bottom of console
  useEffect(() => {
    consoleEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [consoleLogs]);

  // Placeholder for initial engine status check (if needed)
  useEffect(() => {
    // You might want to fetch the current engine status from an RPC or a dedicated table on load
    addLog('info', 'Engine Control Panel Initialized.');
    // Example: async function fetchEngineStatus() { ... setEngineStatus ... } 
    // void fetchEngineStatus();

    // Fetch market regions for the test email selector
    const fetchMarketRegionsForTest = async () => {
      addLog('info', 'Fetching market regions for test email selector...');
      setIsLoadingMarketRegions(true);
      try {
        const response = await fetch('/api/market-regions');
        if (!response.ok) {
          const errorDetails = { error: `Failed to fetch market regions: ${response.statusText}` };
          try {
            // Attempt to parse JSON error response from the server
            const parsedError = await response.json();
            if (parsedError && typeof parsedError.error === 'string') {
              errorDetails.error = parsedError.error;
            }
          } catch {}{
            // Response body wasn't JSON or error field was not a string, use default statusText based error
          }
          throw new Error(errorDetails.error);
        }

        const responseData = await response.json(); // This is 'any' until validated

        // Check if the responseData itself is an error object (e.g., { error: "message" })
        if (typeof responseData === 'object' && responseData !== null && 'error' in responseData && typeof responseData.error === 'string') {
          throw new Error(String(responseData.error || 'Unknown API error'));
        }

        // Perform a runtime check to ensure responseData is an array of MarketRegion objects
        if (!Array.isArray(responseData) || !responseData.every(
            (item: unknown): item is MarketRegion => // Type predicate for better type inference
                typeof item === 'object' && item !== null &&
                'id' in item && typeof item.id === 'string' &&
                'name' in item && typeof item.name === 'string' &&
                'normalized_name' in item && typeof item.normalized_name === 'string'
            // Not strictly checking lead_count here as it's not used for the selection logic
        )) {
          throw new Error('Invalid data format for market regions. Expected an array of MarketRegion objects.');
        }

        const marketRegions: MarketRegion[] = responseData; // Now type-safe

        setMarketRegionsList(marketRegions);

        if (marketRegions.length > 0) {
          const firstRegion = marketRegions[0];
          // After validation, firstRegion.normalized_name is guaranteed to be a string.
          setSelectedTestMarketRegion(firstRegion.normalized_name);
          addLog('info', `Market regions loaded. Default test region: ${firstRegion.name}`);
        } else {
          addLog('warning', 'No market regions found.');
          setSelectedTestMarketRegion(undefined); // Explicitly set to undefined
        }
      } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        addLog('error', `Error fetching market regions: ${errorMessage}`);
        setError(`Failed to load market regions: ${errorMessage}`);
        setMarketRegionsList([]); // Clear list on error
        setSelectedTestMarketRegion(undefined); // Clear selection on error
      } finally {
        setIsLoadingMarketRegions(false);
      }
    };
    void fetchMarketRegionsForTest();
  }, [addLog]);

  const handleScheduleCampaign = async () => {
    if (!selectedCampaignId) {
      addLog('error', 'No campaign selected. Please select a campaign to schedule.');
      return;
    }
    if (!selectedInterval) {
      addLog('error', 'No interval selected. Please set an interval.');
      return;
    }

    setIsScheduling(true);
    const campaignName = allCampaigns.find(c => c.id === selectedCampaignId)?.name || 'Unknown Campaign';
    // Assuming selectedCampaignId is already a valid UUID string from the database.
    const campaignUuid = selectedCampaignId;

    addLog('info', `Attempting to schedule campaign: ${campaignName} (ID: ${campaignUuid}) with offset: ${selectedInterval}`);

    try {
      // Attempt 1: Call with { p_campaign_id, p_start_offset }
      addLog('info', 'Scheduler: Attempting call with order 1 (id, offset)');
      let { data, error } = await supabase.rpc('schedule_campaign', {
        p_campaign_id: campaignUuid,
        p_start_offset: selectedInterval
      });

      // Check for PostgreSQL ambiguity error (code 42883)
      if (error && error.code === '42883') {
        addLog('warning', `Scheduler: Ambiguity with order 1 (code ${error.code}). Retrying with order 2 (offset, id).`);
        // Attempt 2: Call with { p_start_offset, p_campaign_id }
        const response2 = await supabase.rpc('schedule_campaign', {
          p_start_offset: selectedInterval,
          p_campaign_id: campaignUuid
        });
        data = response2.data;
        error = response2.error; // Update error with the result of the second attempt
      }

      if (error) {
        // This will be the error from the first attempt if it wasn't ambiguity,
        // or the error from the second attempt if the first was ambiguity.
        console.error('Error calling schedule_campaign RPC:', error);
        addLog('error', `Failed to schedule campaign ${campaignName}: ${error.message}`, { code: error.code, details: error.details });
        setError(`RPC Error: ${error.message} (Code: ${error.code})`);
      } else {
        addLog('success', `Successfully scheduled campaign ${campaignName} to run with offset: ${selectedInterval}`, { result: data });
      }
    } catch (e: unknown) {
      const errorMessage = e instanceof Error ? e.message : 'An unknown error occurred';
      console.error('Exception calling schedule_campaign RPC:', e);
      addLog('error', `Exception while scheduling campaign ${campaignName}: ${errorMessage}`);
      setError(`Exception: ${errorMessage}`);
    }
    setIsScheduling(false);
  };

  const handleSendTestEmail = async () => {
    if (!selectedTestMarketRegion) {
      addLog('warning', 'Please select a market region for the test email.');
      setError('A market region must be selected to send a test email.');
      return;
    }
    // Updated log message to reflect the new endpoint
    addLog('info', 'Sending request to /api/engine/send-email for test email...');
    setIsLoading(true);
    setEngineStatus('test_sending');
    setError(null);

    try {
      // Changed fetch URL to /api/engine/send-email
      const response = await fetch('/api/engine/send-email', { 
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          marketRegionNormalizedName: selectedTestMarketRegion,
          sendToLead: false, // This is key for triggering test email behavior
          sendPdf: true,    // Explicitly send true for test emails
          // campaignId: undefined, // Explicitly not sending for a simple test email for now
          // specificLeadIdToTest: undefined, // Not selecting a specific lead for this test
        }),
      });

      const result: TestEmailResponse = await response.json();

      if (!response.ok) {
        throw new Error(result.error || `API request failed with status ${response.status}`);
      }

      if (result.success) {
        // Adjusted success log based on send-email response
        let successMsg = 'Test email API success.';
        if (result.messageId) {
          successMsg += ` Message ID: ${result.messageId}.`;
        }
        if (result.message) {
            successMsg += ` Message: ${result.message}.`;
        }
        addLog('success', successMsg);
        // lead_id and subject are logged server-side, not directly available here
        // If needed, a generic message indicating test email was processed for the selected market can be added.
        addLog('info', `Test email for market region '${selectedTestMarketRegion}' processed.`);
      } else {
        throw new Error(result.error || 'Test email API returned success:false');
      }
    } catch (error: unknown) {
      if (error instanceof Error) {
        const errorMessage = error.message;
        addLog('error', `Error during test email: ${errorMessage}`);
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
    if (!selectedTestMarketRegion || selectedTestMarketRegion.trim() === '') {
      const msg = 'Market region cannot be empty. Please select a region.';
      addLog('warning', msg);
      setError(msg);
      return;
    }
    addLog('info', `Initiating Engine start sequence for market region: ${selectedTestMarketRegion}...`);
    setIsLoading(true);
    setEngineStatus('starting');
    setError(null);

    try {
      // Step 1: Call resume-campaign
      addLog('info', 'Attempting to resume campaign processing flag...');
      const resumeResponse = await fetch('/api/engine/resume-campaign', { method: 'POST' });
      const resumeResult: ResumeCampaignResponse = await resumeResponse.json();

      if (!resumeResponse.ok || !resumeResult.success) {
        throw new Error(resumeResult.error || `Failed to resume campaign flag (status ${resumeResponse.status})`);
      }
      addLog('success', 'Campaign processing flag successfully set to RESUMED.');

      // Step 2: Call start-campaign
      addLog('info', `Sending request to /api/engine/start-campaign for market: ${selectedTestMarketRegion}...`);
      const startResponse = await fetch('/api/engine/start-campaign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          market_region: selectedTestMarketRegion /*, limit_per_run: 10 */ }),
      });
      const startResult: StartCampaignResponse = await startResponse.json();

      if (!startResponse.ok) {
        throw new Error(startResult.error || `API request to start-campaign failed with status ${startResponse.status}`);
      }

      if (startResult.success) {
        addLog('success', `Start campaign API success: ${startResult.message}`);
        addLog('info', `Batch details: Attempted: ${startResult.attempted}, Succeeded: ${startResult.succeeded}, Failed: ${startResult.failed}`);
        if (startResult.processing_errors && startResult.processing_errors.length > 0) {
            addLog('warning', `Encountered ${startResult.processing_errors.length} errors during batch processing. Check logs.`, { errors: startResult.processing_errors });
        }
        setEngineStatus('running'); // Reflects that a batch was started
      } else {
        throw new Error(startResult.error || 'Start campaign API returned success:false');
      }
    } catch (error: unknown) {
      if (error instanceof Error) {
        const errorMessage = error.message;
        addLog('error', `Error during engine start sequence: ${errorMessage}`);
        setError(errorMessage);
        setEngineStatus('error');
      }
    } finally {
      setIsLoading(false);
      // Do not reset to 'idle' here if it successfully started a batch ('running') or errored out.
    }
  };

  const handleStopEngine = async () => {
    addLog('info', 'Sending request to /api/engine/stop-campaign...');
    setIsLoading(true);
    setEngineStatus('stopping');
    setError(null);
    try {
      const response = await fetch('/api/engine/stop-campaign', { method: 'POST' });
      const result: StopCampaignResponse = await response.json();

      if (!response.ok) {
        throw new Error(result.error || `API request to stop-campaign failed with status ${response.status}`);
      }

      if (result.success) {
        addLog('success', `Stop campaign API success: ${result.message}`);
        setEngineStatus('stopped'); 
      } else {
        throw new Error(result.error || 'Stop campaign API returned success:false');
      }
    } catch (error: unknown) {
      if (error instanceof Error) {
        const errorMessage = error.message;
        addLog('error', `Error stopping engine: ${errorMessage}`);
        setError(errorMessage);
        setEngineStatus('error'); 
      }
    } finally {
      setIsLoading(false);
      // If it's not an error, it should be 'stopped'. If error, it's 'error'.
      // No automatic reset to 'idle'.
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
      {error && (
        <div className="alert alert-error mb-4">
          <AlertTriangle className="h-5 w-5" />
          <span>{error}</span>
        </div>
      )}
      <div className="card bordered shadow-lg bg-base-100 mb-6"> {/* Log card - MOVED UP & ADDED mb-6 */}
        <div className="card-body p-4 md:p-6">
          <div className="flex justify-between items-center mb-3">
            <h2 className="text-xl font-semibold">Real-time Engine Log</h2>
            {/* Refresh button removed as logs are now real-time via Supabase subscription */}
          </div>
          <div className="bg-neutral text-neutral-content rounded-md p-3 h-64 overflow-y-auto text-xs font-mono">
            {consoleLogs.length === 0 && <p>No log entries yet. Engine activities will appear here.</p>}
            {consoleLogs.map((log) => (
              <div key={log.id} className={`flex items-start mb-1 ${log.type === 'error' ? 'text-error' : log.type === 'success' ? 'text-success' : log.type === 'warning' ? 'text-warning' : ''}`}>
                <span className="mr-2 opacity-70">{new Date(log.timestamp).toLocaleTimeString()}</span>
                {log.type === 'info' && <Info size={14} className="mr-1 mt-px flex-shrink-0" />}
                {log.type === 'error' && <AlertTriangle size={14} className="mr-1 mt-px flex-shrink-0" />}
                {log.type === 'success' && <CheckCircle size={14} className="mr-1 mt-px flex-shrink-0" />}
                {log.type === 'warning' && <AlertTriangle size={14} className="mr-1 mt-px flex-shrink-0 text-warning" />}
                {log.type === 'engine' && <RefreshCw size={14} className="mr-1 mt-px flex-shrink-0 animate-spin" />} {/* Example for 'engine' type */}
                <span>{log.message}</span>
              </div>
            ))}
            <div ref={consoleEndRef} />
          </div>
        </div>
      </div>
      <div className="card bordered shadow-lg bg-base-100 mb-6">
        <div className="card-body p-4 md:p-6"> 
          <div className="mb-6"> 
            <div className="flex flex-col space-y-4 sm:space-y-0 sm:flex-row sm:justify-between sm:items-center"> 
              <h2 className="text-xl font-semibold mb-2 sm:mb-0">
                Engine Status: <span className={`font-bold ${getStatusColor(engineStatus)}`}>{engineStatus.toUpperCase()}</span>
              </h2>
              <div className="form-control w-full sm:w-auto">
                <label htmlFor="marketRegionSelect" className="label pb-1">
                  <span className="label-text flex items-center text-base">
                    <MapPin size={18} className="mr-2" /> Market Region
                  </span>
                </label>
                {isLoadingMarketRegions ? (
                  <div className="skeleton h-12 w-full sm:w-64"></div>
                ) : marketRegionsList.length > 0 ? (
                  <select
                    id="marketRegionSelect"
                    value={selectedTestMarketRegion}
                    onChange={(e) => setSelectedTestMarketRegion(e.target.value)}
                    className="select select-bordered w-full sm:w-64"
                    disabled={isLoading || isLoadingMarketRegions || ['starting', 'running', 'stopping', 'test_sending'].includes(engineStatus)}
                  >
                    {marketRegionsList.map((region) => (
                      <option key={region.id} value={region.normalized_name}>
                        {region.name} ({region.lead_count} leads)
                      </option>
                    ))}
                  </select>
                ) : (
                  <p className="text-sm text-base-content opacity-70 mt-2">No market regions available.</p>
                )}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <button
              onClick={() => {
                void handleTestEmailClick(); 
                // Any immediate synchronous UI updates can go here if needed,
                // but async state changes (like loading) should be in handleTestEmailClick itself.
              }}
              className="btn btn-warning w-full text-base py-3"
              disabled={isLoading || isLoadingMarketRegions || !selectedTestMarketRegion || ['starting', 'running', 'stopping', 'test_sending'].includes(engineStatus)}
            >
              <Mail size={20} className="mr-2" /> Send Test Email
            </button>

            <button
              onClick={() => {
                void handleStartClick(); 
                // Any immediate synchronous UI updates can go here if needed,
                // but async state changes (like loading) should be in handleStartClick itself.
              }}
              className="btn btn-success w-full text-base py-3"
              disabled={isLoading || isLoadingMarketRegions || !selectedTestMarketRegion || ['starting', 'running', 'stopping', 'test_sending'].includes(engineStatus)}
            >
              <PlayCircle size={20} className="mr-2" /> Start Engine
            </button>

            <button
              onClick={() => {
                void handleStopClick(); 
                // Any immediate synchronous UI updates can go here if needed,
                // but async state changes (like loading) should be in handleStopClick itself.
              }}
              className="btn btn-error w-full text-base py-3"
              disabled={isLoading || ['stopping', 'stopped', 'idle', 'test_sending'].includes(engineStatus)}
            >
              <StopCircle size={20} className="mr-2" /> Stop Engine
            </button>
          </div>

          {/* Campaign Scheduler Controls */}
          <div className="mt-6 border-t pt-6">
            <h3 className="text-lg font-semibold mb-4">Schedule Campaign</h3>

            {/* Schedule Button - MOVED UP - full width, added mb-4 */}
            <div className="form-control w-full mb-4">
              <button 
                className={`btn btn-primary w-full ${isScheduling ? 'loading' : ''}`}
                onClick={handleScheduleCampaign}
                disabled={isLoading || !selectedCampaignId || isScheduling}
              >
                {isScheduling ? 'Scheduling...' : 'Schedule Campaign'}
              </button>
            </div>

            {/* Flex row for Campaign Selector and TimePicker - MOVED DOWN, removed mb-4 */}
            <div className="flex flex-row gap-4 items-baseline">
              {/* Campaign Selection Dropdown - takes 2/3 width */}
              <div className="form-control w-2/3">
                <label className="label">
                  <span className="label-text">Select Campaign</span>
                </label>
                <select 
                  className="select select-bordered select-sm w-full"
                  value={selectedCampaignId}
                  onChange={(e) => setSelectedCampaignId(e.target.value)}
                  disabled={isLoading || allCampaigns.length === 0}
                >
                  {allCampaigns.length === 0 && <option value="">{isLoading ? 'Loading campaigns...' : 'No campaigns found'}</option>}
                  {allCampaigns.map((campaign) => (
                    <option key={campaign.id} value={campaign.id}>
                      {campaign.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* TimePicker for Interval - takes 1/3 width */}
              <div className="form-control w-1/3">
                <TimePicker 
                  inlineLabel="Start Offset"
                  initialInterval={selectedInterval} 
                  onIntervalChange={(interval) => setSelectedInterval(interval)} 
                />
              </div>
            </div>

            {/* Schedule Button - full width below the row */}
            {/* <div className="form-control w-full">
              <button 
                className={`btn btn-primary w-full ${isScheduling ? 'loading' : ''}`}
                onClick={handleScheduleCampaign}
                disabled={isScheduling || !selectedCampaignId || allCampaigns.length === 0}
              >
                {isScheduling ? 'Scheduling...' : 'Schedule Campaign'}
              </button>
            </div> */}
          </div>
        </div>
      </div>
    </div>
  );
};

// Interface for raw log items fetched from the backend/Supabase
interface FetchedLogItem {
  id: string | number;
  processed_at?: string | null; // Timestamps from DB can be string or null
  message?: string | null;      // Message content
  log_level?: string | null;    // Log level from DB, used to map to LogEntry['type']
  data?: Record<string, unknown>;                   // Any additional data associated with the log
}

export default EngineControlView;
