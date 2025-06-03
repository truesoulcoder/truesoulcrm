'use client';

import { PlayCircle, StopCircle, Mail, AlertTriangle, Info, CheckCircle, RefreshCw, MapPin } from 'lucide-react';
import React, { useState, useEffect, useCallback, useRef, JSX } from 'react';
import { Button, Card, Alert, Input } from 'react-daisyui'; // Added Input

import { supabase } from '@/lib/supabase/client';
import { Database } from '@/types/supabase';

// Assuming eli5_email_log is the primary source of real-time messages for now
type Eli5EmailLogEntry = Database['public']['Tables']['eli5_email_log']['Row'];

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

const Eli5EngineControlView: React.FC = (): JSX.Element => {
  const [engineStatus, setEngineStatus] = useState<EngineStatus>('idle');
  const [marketRegion, setMarketRegion] = useState<string>('FLORIDA'); // Added marketRegion state
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
    addLog('ELI5 Engine Control Panel Initialized.', 'info');
    // Example: async function fetchEngineStatus() { ... setEngineStatus ... } 
    // void fetchEngineStatus();
  }, [addLog]);

  // Real-time subscription to eli5_email_log for console updates
  useEffect(() => {
    const eli5LogChannelName = 'eli5-engine-realtime-log-channel';
    const subscription = supabase
      .channel(eli5LogChannelName)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'eli5_email_log' }, // Listen to all changes for now
        (payload) => {
          const record = payload.new as Eli5EmailLogEntry;
          let message = `ELI5 Log (${payload.eventType}): `; 
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
          addLog('Connected to ELI5 Engine real-time log stream.', 'success');
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          const errorMessage = `ELI5 Log Stream Error: ${err?.message || 'Unknown error'}`;
          addLog(errorMessage, 'error');
          setError(errorMessage);
        }
      });

    return () => {
      addLog('Disconnecting from ELI5 Engine log stream...', 'info');
      if (subscription) void supabase.removeChannel(subscription);
    };
  }, [addLog]);

  const handleSendTestEmail = async () => {
    addLog('Sending request to /api/eli5-engine/test-email...', 'info');
    setIsLoading(true);
    setEngineStatus('test_sending');
    setError(null);

    try {
      const response = await fetch('/api/eli5-engine/test-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // No body needed for test-email as per current API design
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
    addLog(`Initiating ELI5 Engine start sequence for market region: ${marketRegion}...`, 'info');
    setIsLoading(true);
    setEngineStatus('starting');
    setError(null);

    try {
      // Step 1: Call resume-campaign
      addLog('Attempting to resume campaign processing flag...', 'info');
      const resumeResponse = await fetch('/api/eli5-engine/resume-campaign', { method: 'POST' });
      const resumeResult = await resumeResponse.json();

      if (!resumeResponse.ok || !resumeResult.success) {
        throw new Error(resumeResult.error || `Failed to resume campaign flag (status ${resumeResponse.status})`);
      }
      addLog('Campaign processing flag successfully set to RESUMED.', 'success');

      // Step 2: Call start-campaign
      addLog(`Sending request to /api/eli5-engine/start-campaign for market: ${marketRegion}...`, 'info');
      const startResponse = await fetch('/api/eli5-engine/start-campaign', {
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
    addLog('Sending request to /api/eli5-engine/stop-campaign...', 'info');
    setIsLoading(true);
    setEngineStatus('stopping');
    setError(null);
    try {
      const response = await fetch('/api/eli5-engine/stop-campaign', { method: 'POST' });
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
      <h1 className="text-3xl font-bold mb-6 text-center">ELI5 Engine Control Panel</h1>

      {error && (
        <Alert status="error" icon={<AlertTriangle />} className="mb-4">
          {error}
        </Alert>
      )}

      <Card className="card bordered shadow-lg bg-base-100 mb-6">
        <Card.Body className="p-4">
          <div className="flex flex-col sm:flex-row justify-between items-center mb-4">
            <h2 className="text-xl font-semibold">Engine Status: <span className={`font-bold ${getStatusColor(engineStatus)}`}>{engineStatus.toUpperCase()}</span></h2>
            <div className="form-control w-full sm:w-auto mt-3 sm:mt-0">
              <label className="label" htmlFor="marketRegionInput">
                <span className="label-text flex items-center"><MapPin size={16} className="mr-1" /> Market Region</span>
              </label>
              <Input 
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
            <Button 
              color="primary" 
              startIcon={<Mail />} 
              onClick={handleTestEmailClick}
              loading={isLoading && engineStatus === 'test_sending'}
              disabled={isLoading && engineStatus !== 'test_sending'}
            >
              Send Test Email
            </Button>
            <Button 
              color="success" 
              startIcon={<PlayCircle />} 
              onClick={handleStartClick}
              loading={isLoading && engineStatus === 'starting'}
              disabled={isLoading && engineStatus !== 'starting' || engineStatus === 'running' || !marketRegion.trim()}
            >
              Start Engine
            </Button>
            <Button 
              color="error" 
              startIcon={<StopCircle />} 
              onClick={handleStopClick}
              loading={isLoading && engineStatus === 'stopping'}
              disabled={isLoading && engineStatus !== 'stopping' || engineStatus === 'idle' || engineStatus === 'stopped'}
            >
              Stop Engine
            </Button>
          </div>
        </Card.Body>
      </Card>

      <Card className="card bordered shadow-lg bg-base-100">
        <Card.Body className="p-4">
          <h2 className="text-xl font-semibold mb-3">Real-time Engine Log</h2>
          <div className="h-96 overflow-y-auto bg-neutral text-neutral-content p-3 rounded-md text-sm font-mono">
            {consoleLogs.length === 0 && <p>No log messages yet. Waiting for ELI5 Engine activity...</p>}
            {consoleLogs.map(log => (
              <div key={log.id} className={`whitespace-pre-wrap ${log.type === 'error' ? 'text-red-400' : log.type === 'success' ? 'text-green-400' : log.type === 'warning' ? 'text-yellow-400' : ''}`}>
                <span className="text-gray-500">{new Date(log.timestamp).toLocaleTimeString()} | </span>
                <span>{log.message}</span>
                {log.data && <details className="text-xs text-gray-600"><summary>Raw Data</summary><pre>{JSON.stringify(log.data, null, 2)}</pre></details>}
              </div>
            ))}
            <div ref={consoleEndRef} />
          </div>
        </Card.Body>
      </Card>
    </div>
  );
};

export default Eli5EngineControlView;
