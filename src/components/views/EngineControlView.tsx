'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsContent } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useEngineControl } from '@/hooks/useEngineControl';

// LogEntry is now primarily defined in useEngineControl hook, but keeping type here for clarity if needed.
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
      // Attempt to parse and pretty-print if the message is a JSON string
      if (typeof displayMessage === 'string' && displayMessage.trim().startsWith('{')) {
        try {
          const parsedJson = JSON.parse(displayMessage);
          displayMessage = JSON.stringify(parsedJson, null, 2);
        } catch (e) {
          // Not a valid JSON string, leave as is
        }
      } else if (typeof displayMessage !== 'string') {
        // For any non-string messages that might have slipped through
        displayMessage = JSON.stringify(displayMessage, null, 2);
      }
      
      return (
        <div
          key={log.id}
          className={`p-2 rounded ${
            log.type === 'error'
              ? 'bg-red-900/10 text-red-400'
              : log.type === 'success'
              ? 'bg-green-900/10 text-green-400'
              : log.type === 'warning'
              ? 'bg-yellow-900/10 text-yellow-400'
              : 'bg-base-300'
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
    <Card className="h-full flex flex-col">
      <CardHeader>
        <CardTitle>Engine Control</CardTitle>
        <div className="flex items-center space-x-2 mt-2">
          <p>Status: <span className={`font-bold ${status === 'running' ? 'text-green-500' : 'text-red-500'}`}>{status}</span></p>
          {campaigns.length > 0 && (
            <>
              <Button onClick={() => handleCampaignAction(startCampaign, campaigns[0].id)} disabled={status === 'running'}>Start</Button>
              <Button onClick={() => handleCampaignAction(stopCampaign, activeCampaignId)} disabled={status !== 'running'}>Stop</Button>
              <Button onClick={() => handleCampaignAction(resumeCampaign, activeCampaignId)} disabled={status !== 'paused'}>Resume</Button>
              <Button onClick={() => clearLogs('all')} variant="destructive">Clear All Logs</Button>
            </>
          )}
        </div>
      </CardHeader>
      <CardContent className="flex-grow flex flex-col">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-grow flex flex-col">
          <TabsList>
            <Tab value="engine">Engine Logs</Tab>
            <Tab value="system">System Events</Tab>
            <Tab value="jobs">Campaign Jobs</Tab>
          </TabsList>
          <div className="flex-grow bg-black/50 p-4 rounded-b-md overflow-y-auto h-96">
            <TabsContent value="engine" className="h-full">
              <div className="space-y-2">{renderLogs(logs.engine)}</div>
            </TabsContent>
            <TabsContent value="system" className="h-full">
              <div className="space-y-2">{renderLogs(logs.system)}</div>
            </TabsContent>
            <TabsContent value="jobs" className="h-full">
              <div className="space-y-2">{renderLogs(logs.jobs)}</div>
            </TabsContent>
            <div ref={consoleEndRef} />
          </div>
        </Tabs>
      </CardContent>
    </Card>
  );
};

export default EngineControlView;