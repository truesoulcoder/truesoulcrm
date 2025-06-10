// src/components/dashboard/RecentActivity.tsx
'use client';

import React from 'react';
import { Card, CardHeader, CardBody, CardTitle, CardDescription } from '@heroui/react';
import { Users, Mail, Settings2, UserPlus, MessageSquareQuote, CheckCircle2 } from 'lucide-react'; // Added more icons

interface ActivityItem {
  id: string;
  icon: React.ReactNode;
  description: string;
  time: string;
}

const mockActivities: ActivityItem[] = [
  {
    id: '1',
    icon: <UserPlus className="h-5 w-5 text-success-500" />,
    description: "New lead 'Jane Doe' added to 'Winter Promo'",
    time: '5m ago',
  },
  {
    id: '2',
    icon: <Mail className="h-5 w-5 text-info-500" />,
    description: "Email campaign 'Q1 Newsletter' sent to 1,200 contacts",
    time: '1h ago',
  },
  {
    id: '3',
    icon: <Settings2 className="h-5 w-5 text-neutral-500" />,
    description: "User 'admin' updated API integration settings",
    time: '3h ago',
  },
  {
    id: '4',
    icon: <MessageSquareQuote className="h-5 w-5 text-secondary-500" />,
    description: "Reply received from 'john.doe@example.com' for 'Follow-up' campaign",
    time: '1d ago',
  },
   {
    id: '5',
    icon: <CheckCircle2 className="h-5 w-5 text-primary-500" />,
    description: "Task 'Prepare Q2 Report' marked as complete by 'Alice'",
    time: '2d ago',
  },
];

const RecentActivity = () => {
  return (
    <Card className="h-full flex flex-col">
      <CardHeader>
        <CardTitle>Recent Activity</CardTitle>
        <CardDescription>Latest updates across your workspace</CardDescription>
      </CardHeader>
      <CardBody className="overflow-y-auto flex-grow">
        <div className="space-y-4">
          {mockActivities.map((activity) => (
            <div key={activity.id} className="flex items-start gap-3">
              <div className="flex-shrink-0 mt-1">{activity.icon}</div>
              <div className="flex-grow">
                <p className="text-sm text-neutral-content">{activity.description}</p>
                <p className="text-xs text-neutral-content/70">{activity.time}</p>
              </div>
            </div>
          ))}
        </div>
      </CardBody>
    </Card>
  );
};

export default RecentActivity;
