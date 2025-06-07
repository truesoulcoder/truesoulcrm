'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useEngineControl } from '@/hooks/useEngineControl';

interface LogEntry {
  id: string;
  timestamp: string;
  message: string;
  type: 'info' | 'error' | 'success' | 'warning';
  data?: any;
}

const EngineControlView = () => {
  const {
    campaigns,
    status,
    logs,
    startCampaign,
    stopCampaign,
    resumeCampaign,
    clearLogs,
  } = useEngineControl();

  const [activeTab, setActiveTab] = useState('engine');
  const consoleEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    consoleEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs, activeTab]);

  const handleCampaignAction = async (action: (id: number) => Promise<void>, campaignId?: number) => {
    if (campaignId === undefined) {
      console.error("No campaign selected for action");
      return;
    }
    try {
      await action(campaignId);
    } catch (error) {
      console.error(`Failed to ${action.name} campaign:`, error);
    }
  };

  const activeCampaignId = campaigns.find(c => c.status === 'running' || c.status === 'paused')?.id;

  const renderLogs = (logData: LogEntry[]) => {
    if (logData.length === 0) {
      return <p className="text-center text-gray-500">No logs to display.</p>;
    }

    return logData.map((log) => {
      let displayMessage = log.message;
      if (typeof displayMessage === 'string' && displayMessage.trim().startsWith('{')) {
        try {
          const parsedJson = JSON.parse(displayMessage);
          displayMessage = JSON.stringify(parsedJson, null, 2);
        } catch (e) {
          // Not valid JSON
        }
      } else if (typeof displayMessage !== 'string') {
        displayMessage = JSON.stringify(displayMessage, null, 2);
      }
      
      return (
        <div
          key={log.id}
          className={`p-2 rounded ${
            log.type === 'error' ? 'bg-error/10 text-error-content' :
            log.type === 'success' ? 'bg-success/10 text-success-content' :
            log.type === 'warning' ? 'bg-warning/10 text-warning-content' :
            'bg-base-300'
          }`}
        >
          <div className="flex justify-between text-xs opacity-70 mb-1">
            <span>{new Date(log.timestamp).toLocaleString()}</span>
            <span className="font-mono">ID: {log.id}</span>
          </div>
          <div className="font-mono text-sm break-words whitespace-pre-wrap">
            {displayMessage}
          </div>
          {log.data && (
            <details className="mt-1">
              <summary className="text-xs cursor-pointer opacity-70">
                Details
              </summary>
              <pre className="text-xs p-2 bg-base-100 rounded mt-1 overflow-x-auto">
                {JSON.stringify(log.data, null, 2)}
              </pre>
            </details>
          )}
        </div>
      );
    });
  };

  return (
    <div className="card bg-base-100 shadow-xl h-full flex flex-col">
      <div className="card-body p-4 flex flex-col h-full">
        <div className="card-title flex flex-col md:flex-row justify-between items-start md:items-center gap-2">
          <h2 className="text-xl font-bold">Engine Control</h2>
          <div className="flex items-center space-x-2">
            <p>Status: <span className={`font-bold ${status === 'running' ? 'text-success' : 'text-error'}`}>
              {status}
            </span></p>
          </div>
        </div>
        
        <div className="flex flex-col flex-grow">
          <div className="flex flex-wrap gap-2 mb-4">
            {campaigns.length > 0 && (
              <>
                <button 
                  className="btn btn-primary btn-sm"
                  onClick={() => handleCampaignAction(startCampaign, campaigns[0].id)}
                  disabled={status === 'running'}
                >
                  Start
                </button>
                <button 
                  className="btn btn-error btn-sm"
                  onClick={() => handleCampaignAction(stopCampaign, activeCampaignId)}
                  disabled={status !== 'running'}
                >
                  Stop
                </button>
                <button 
                  className="btn btn-warning btn-sm"
                  onClick={() => handleCampaignAction(resumeCampaign, activeCampaignId)}
                  disabled={status !== 'paused'}
                >
                  Resume
                </button>
                <button 
                  className="btn btn-secondary btn-sm"
                  onClick={() => clearLogs('all')}
                >
                  Clear Logs
                </button>
              </>
            )}
          </div>
          
          <div className="tabs tabs-boxed bg-base-200 mb-2">
            <button 
              className={`tab ${activeTab === 'engine' ? 'tab-active' : ''}`}
              onClick={() => setActiveTab('engine')}
            >
              Engine Logs
            </button>
            <button 
              className={`tab ${activeTab === 'system' ? 'tab-active' : ''}`}
              onClick={() => setActiveTab('system')}
            >
              System Events
            </button>
            <button 
              className={`tab ${activeTab === 'jobs' ? 'tab-active' : ''}`}
              onClick={() => setActiveTab('jobs')}
            >
              Campaign Jobs
            </button>
          </div>
          
          <div className="bg-base-200 rounded-md p-4 flex-grow overflow-y-auto h-96">
            <div className="space-y-2">
              {activeTab === 'engine' && renderLogs(logs.engine)}
              {activeTab === 'system' && renderLogs(logs.system)}
              {activeTab === 'jobs' && renderLogs(logs.jobs)}
            </div>
            <div ref={consoleEndRef} />
          </div>
        </div>
      </div>
    </div>
  );
};

export default EngineControlView;