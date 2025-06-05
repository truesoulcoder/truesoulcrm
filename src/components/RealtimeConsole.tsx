// src/components/RealtimeConsole.tsx
import React, { useEffect, useState, useRef } from 'react';
import { supabase } from '@/lib/supabase/client';
import { RealtimePostgresChangesPayload } from '@supabase/supabase-js';

type LogEntry = {
  id: string;
  timestamp: string;
  message: string;
  type: 'info' | 'error' | 'success' | 'warning' | 'engine';
  data?: any;
};

type TableName = 'campaign_jobs' | 'system_event_log' | 'engine_log';

// Define a base type for common log entry fields
type BaseLogEntry = {
  id: string | number;
  created_at: string;
  message: string;
  // Add other common fields that exist across different log types
};

// Update the RealtimePayload to use BaseLogEntry as the default type
type RealtimePayload<T extends Record<string, unknown> = BaseLogEntry> = {
  new?: T;
  old?: T;
  eventType: 'INSERT' | 'UPDATE' | 'DELETE';
  schema: string;
  table: string;
  commit_timestamp: string;
};

// Define the payload shape for system_event_log
type SystemEventLog = {
  id: number;
  created_at: string;
  message: string;
  // Add other fields that might be in your system_event_log table
};

// Define the payload shape for campaign_jobs
interface CampaignJobEntry extends BaseLogEntry {
  id: string;
  status: 'SENT' | 'PENDING' | 'FAILED'; // or a more specific union type like 'SENT' | 'PENDING' | 'FAILED' if known
  contact_name: string | null;
  contact_email: string | null;
  assigned_sender_id: string | null;
  next_processing_time: string | null;
  error_message?: string | null;
  processed_at?: string | null;
  campaign_id: string;
  lead_id: string;
  email_message_id?: string | null;
  market_region?: string | null;
  [key: string]: unknown; // Index signature to satisfy Record<string, unknown>
}

// Define a union type of all possible table payloads
type TablePayloads = 
  | RealtimePayload<SystemEventLog>
  | RealtimePayload<CampaignJobEntry>
  | RealtimePayload;

const MAX_LOGS_PER_TABLE = 10;

export const RealtimeConsole = () => {
  const [activeTab, setActiveTab] = useState<TableName>('system_event_log');
  const [logs, setLogs] = useState<Record<TableName, LogEntry[]>>({
    campaign_jobs: [],
    system_event_log: [],
    engine_log: [],
  });
  const consoleEndRef = useRef<HTMLDivElement>(null);

  // Subscribe to real-time updates for all tables
  useEffect(() => {
    const tables: TableName[] = ['campaign_jobs', 'system_event_log', 'engine_log'];
    const subscriptions = tables.map((table) => {
      return supabase
        .channel(`realtime_${table}`)
        .on(
          'postgres_changes',
          { 
            event: '*', 
            schema: 'public', 
            table,
          },
          (payload: TablePayloads) => {
            const logEntry = formatLogEntry(table, payload);
            setLogs((prev) => ({ ...prev, [table]: [...prev[table], logEntry].slice(0, MAX_LOGS_PER_TABLE) }));
          }
        )
        .subscribe();
    });

    return () => {
      subscriptions.forEach((subscription) => {
        supabase.removeChannel(subscription);
      });
    };
  }, []);

  const formatLogEntry = (table: TableName, payload: TablePayloads): LogEntry => {
    const now = new Date().toISOString();
    
    // Format the log entry based on the table
    switch (table) {
      case 'system_event_log': {
        const logData = payload as RealtimePayload<SystemEventLog>;
        return {
          id: String(logData.new?.id || Date.now()),
          timestamp: logData.new?.created_at || now,
          message: logData.new?.message || 'No message',
          type: 'info',
          data: logData.new,
        };
      }
      case 'campaign_jobs': {
        const jobData = payload as RealtimePayload<CampaignJobEntry>;
        return {
          id: String(jobData.new?.id || Date.now()),
          timestamp: jobData.new?.created_at || now,
          message: `Job updated: ${jobData.new?.status || 'status changed'}`,
          type: 'info',
          data: jobData.new,
        };
      }
      case 'engine_log':
      default:
        return {
          id: String(payload.new?.id || Date.now()),
          timestamp: payload.new?.processed_at || now,
          message: payload.new?.message || 'No message',
          type: (payload.new?.log_level as LogEntry['type']) || 'info',
          data: payload.new,
        };
    }
  };

  return (
    <div className="card bg-base-200 shadow-lg">
      <div className="card-body p-0">
        {/* Tabs */}
        <div className="tabs tabs-boxed bg-base-200 p-2">
          {(['system_event_log', 'campaign_jobs', 'engine_log'] as TableName[]).map((tab) => (
            <button
              key={tab}
              className={`tab ${activeTab === tab ? 'tab-active' : ''}`}
              onClick={() => setActiveTab(tab)}
            >
              {tab.replace(/_/g, ' ').toUpperCase()}
            </button>
          ))}
        </div>

        {/* Logs */}
        <div className="p-4 h-96 overflow-y-auto bg-base-100">
          {logs[activeTab].length === 0 ? (
            <p className="text-center text-base-content/50">No logs available</p>
          ) : (
            <div className="space-y-2">
              {logs[activeTab].map((log) => (
                <div
                  key={log.id}
                  className={`p-2 rounded ${
                    log.type === 'error'
                      ? 'bg-error/10 text-error'
                      : log.type === 'success'
                      ? 'bg-success/10 text-success'
                      : log.type === 'warning'
                      ? 'bg-warning/10 text-warning'
                      : 'bg-base-200'
                  }`}
                >
                  <div className="flex justify-between text-xs opacity-70 mb-1">
                    <span>{new Date(log.timestamp).toLocaleString()}</span>
                    <span className="font-mono">ID: {log.id}</span>
                  </div>
                  <div className="font-mono text-sm break-words">
                    {log.message}
                  </div>
                  {log.data && (
                    <details className="mt-1">
                      <summary className="text-xs cursor-pointer opacity-70">
                        Details
                      </summary>
                      <pre className="text-xs p-2 bg-base-300 rounded mt-1 overflow-x-auto">
                        {JSON.stringify(log.data, null, 2)}
                      </pre>
                    </details>
                  )}
                </div>
              ))}
              <div ref={consoleEndRef} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};