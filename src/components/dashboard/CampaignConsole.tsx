// src/components/dashboard/CampaignConsole.tsx
'use client';

import React from 'react';
import { Card, CardHeader, CardBody } from '@heroui/react'; // Removed CardTitle, CardDescription

const mockLogs = [
  "INFO: Campaign 'Winter Promo' started successfully.",
  "DEBUG: Email batch 1 of 5 sent to 1000 recipients.",
  "WARN: SMTP server experiencing high load. Retrying 50 emails.",
  "INFO: Email batch 2 of 5 sent to 1000 recipients.",
  "ERROR: Failed to send email to user_123@example.com. Invalid address.",
  "INFO: Email batch 3 of 5 sent to 999 recipients.",
  "DEBUG: User 'john.doe@example.com' opened 'Winter Promo' email.",
];

const CampaignConsole = () => {
  return (
    <Card className="h-full flex flex-col">
      <CardHeader>
        <div>
          <h3 className="text-lg font-semibold text-foreground">Campaign Console</h3>
          <p className="text-sm text-default-500">Live campaign updates</p>
        </div>
      </CardHeader>
      <CardBody className="overflow-y-auto flex-grow">
        <div className="space-y-2">
          {mockLogs.map((log, index) => (
            <div
              key={index}
              className={`p-2 rounded-md text-sm font-mono ${
                index % 2 === 0 ? 'bg-neutral-100 dark:bg-neutral-800' : 'bg-neutral-50 dark:bg-neutral-700/50'
              } ${
                log.startsWith('ERROR') ? 'text-danger-500' : 
                log.startsWith('WARN') ? 'text-warning-500' : 
                log.startsWith('INFO') ? 'text-info-500' : 'text-neutral-content'
              }`}
            >
              {log}
            </div>
          ))}
        </div>
      </CardBody>
    </Card>
  );
};

export default CampaignConsole;
