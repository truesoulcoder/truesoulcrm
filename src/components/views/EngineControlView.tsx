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
  type: 'info' | 'error' | 'success' | 'warning' | 'engine';
  data?: any;
}

interface RawEngineLog {
  id: number;
  processed_at: string | null;
  message: string;
  log_level: string | null;
  data?: any;
}

interface EngineLogTablePayload {
  id: number; // Assuming 'id' in 'engine_log' is a number (e.g., SERIAL)
  timestamp: string; // Assuming 'timestamp' from DB is an ISO string
  message: string;
  type: LogEntry['type']; // Assuming 'type' column matches 'info', 'error', etc.
  data?: any;
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

const EngineControlView: React.FC = (): JSX.Element => {
  const [engineStatus, setEngineStatus] = useState<EngineStatus>('idle');
  const [marketRegionsList, setMarketRegionsList] = useState<MarketRegion[]>([]);
  const [selectedTestMarketRegion, setSelectedTestMarketRegion] = useState<string | undefined>('');
  const [isLoadingMarketRegions, setIsLoadingMarketRegions] = useState<boolean>(true);
  const [consoleLogs, setConsoleLogs] = useState<LogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const consoleEndRef = useRef<null | HTMLDivElement>(null);

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
      } catch (e: any) {
        console.error('Exception fetching initial logs:', e);
        setConsoleLogs(prevLogs => [
          ...prevLogs,
          {
            id: `${Date.now().toString()}_fetch_exception`,
            timestamp: new Date().toISOString(),
            message: `Exception fetching initial logs: ${e.message}`,
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
          const newLogEntry: LogEntry = {
            id: String(newRawLog.id),
            timestamp: new Date(newRawLog.timestamp).toISOString(),
            message: newRawLog.message,
            type: newRawLog.type as LogEntry['type'],
            data: newRawLog.data,
          };
          // Append new log to the end of the existing logs
          setConsoleLogs((prevLogs) => [...prevLogs, newLogEntry]);
        }
      )
      .subscribe((status, err) => {
        if (status === 'SUBSCRIBED') {
          console.log('Successfully subscribed to engine_log changes!');
        } else if (status === 'CHANNEL_ERROR' || err) {
          console.error('Engine log subscription error:', err);
          setConsoleLogs(prevLogs => [
            ...prevLogs,
            {
              id: `${Date.now().toString()}_sub_error`,
              timestamp: new Date().toISOString(),
              message: `Log subscription error: ${err?.message || 'Unknown error'}`,
              type: 'error'
            }
          ]);
        }
      });

    // Cleanup function to remove the channel subscription when the component unmounts
    return () => {
      void supabase.removeChannel(channel);
    };
  }, []); // Empty dependency array, supabase client is stable

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
          const errorDetails = { error: `Failed to fetch market regions: ${response.statusText}` };
          try {
            // Attempt to parse JSON error response from the server
            const parsedError = await response.json();
            if (parsedError && typeof parsedError.error === 'string') {
              errorDetails.error = parsedError.error;
            }
          } catch (e) {
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
            (item: any): item is MarketRegion => // Type predicate for better type inference
                typeof item === 'object' && item !== null &&
                typeof item.id === 'string' &&
                typeof item.name === 'string' &&
                typeof item.normalized_name === 'string'
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
          addLog(`Market regions loaded. Default test region: ${firstRegion.name}`, 'info');
        } else {
          addLog('No market regions found.', 'warning');
          setSelectedTestMarketRegion(undefined); // Explicitly set to undefined
        }
      } catch (err: any) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        addLog(`Error fetching market regions: ${errorMessage}`, 'error');
        setError(`Failed to load market regions: ${errorMessage}`);
        setMarketRegionsList([]); // Clear list on error
        setSelectedTestMarketRegion(undefined); // Clear selection on error
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
    addLog('Sending request to /api/engine/test-email...', 'info');
    setIsLoading(true);
    setEngineStatus('test_sending');
    setError(null);

    try {
      const response = await fetch('/api/engine/test-email', { 
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          marketRegionNormalizedName: selectedTestMarketRegion,
          sendToLead: false, // Corrected for test email flow
          sendPdf: true,    // Explicitly send true for test emails
        }),
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
    if (!selectedTestMarketRegion || selectedTestMarketRegion.trim() === '') {
      const msg = 'Market region cannot be empty. Please select a region.';
      addLog(msg, 'warning');
      setError(msg);
      return;
    }
    addLog(`Initiating Engine start sequence for market region: ${selectedTestMarketRegion}...`, 'info');
    setIsLoading(true);
    setEngineStatus('starting');
    setError(null);

    try {
      // Step 1: Call resume-campaign
      addLog('Attempting to resume campaign processing flag...', 'info');
      const resumeResponse = await fetch('/api/engine/resume-campaign', { method: 'POST' });
      const resumeResult: ResumeCampaignResponse = await resumeResponse.json();

      if (!resumeResponse.ok || !resumeResult.success) {
        throw new Error(resumeResult.error || `Failed to resume campaign flag (status ${resumeResponse.status})`);
      }
      addLog('Campaign processing flag successfully set to RESUMED.', 'success');

      // Step 2: Call start-campaign
      addLog(`Sending request to /api/engine/start-campaign for market: ${selectedTestMarketRegion}...`, 'info');
      const startResponse = await fetch('/api/engine/start-campaign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ market_region: selectedTestMarketRegion /*, limit_per_run: 10 */ }),
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
    addLog('Sending request to /api/engine/stop-campaign...', 'info');
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
        </div>
      </div>

      <div className="card bordered shadow-lg bg-base-100">
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
                {log.type === 'engine' && <RefreshCw size={14} className="mr-1 mt-px flex-shrink-0 animate-pulse" />}
                <span className="whitespace-pre-wrap break-all">{log.message}</span>
              </div>
            ))}
            <div ref={consoleEndRef} />
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
  data?: any;                   // Any additional data associated with the log
}

export default EngineControlView;
