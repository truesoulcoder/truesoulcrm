// src/components/dashboard/QuickActions.tsx
'use client';

import React from 'react';
import { Card, CardHeader, CardBody, Button } from '@heroui/react'; // Removed CardTitle, CardDescription
import { PlusCircle, UploadCloud, BarChartBig, Settings } from 'lucide-react';

const QuickActions = () => {
  return (
    <Card className="h-full flex flex-col">
      <CardHeader>
        <div>
          <h3 className="text-lg font-semibold text-foreground">Quick Actions</h3>
          <p className="text-sm text-default-500">Get started quickly</p>
        </div>
      </CardHeader>
      <CardBody className="flex-grow overflow-y-auto">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Button variant="outline" className="w-full flex items-center justify-start text-left p-3">
            <PlusCircle className="h-5 w-5 mr-3 text-primary-500" />
            <div>
              <p className="font-semibold">New Campaign</p>
              <p className="text-xs text-neutral-content/70">Launch a new marketing campaign</p>
            </div>
          </Button>
          <Button variant="outline" className="w-full flex items-center justify-start text-left p-3">
            <UploadCloud className="h-5 w-5 mr-3 text-secondary-500" />
             <div>
              <p className="font-semibold">Import Leads</p>
              <p className="text-xs text-neutral-content/70">Upload your contact list</p>
            </div>
          </Button>
          <Button variant="outline" className="w-full flex items-center justify-start text-left p-3">
            <BarChartBig className="h-5 w-5 mr-3 text-accent-500" />
            <div>
              <p className="font-semibold">View Reports</p>
              <p className="text-xs text-neutral-content/70">Analyze campaign performance</p>
            </div>
          </Button>
          <Button variant="outline" className="w-full flex items-center justify-start text-left p-3">
            <Settings className="h-5 w-5 mr-3 text-neutral-500" />
            <div>
              <p className="font-semibold">Settings</p>
              <p className="text-xs text-neutral-content/70">Configure your workspace</p>
            </div>
          </Button>
        </div>
      </CardBody>
    </Card>
  );
};

export default QuickActions;
