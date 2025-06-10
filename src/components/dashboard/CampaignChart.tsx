// src/components/dashboard/CampaignChart.tsx
'use client';

import React from 'react';
import { Card, CardHeader, CardBody, CardTitle, CardDescription } from '@heroui/react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip, CartesianGrid } from 'recharts';

const mockData = [
  { name: 'Mon', value: 400 },
  { name: 'Tue', value: 300 },
  { name: 'Wed', value: 600 },
  { name: 'Thu', value: 800 },
  { name: 'Fri', value: 700 },
  { name: 'Sat', value: 500 },
  { name: 'Sun', value: 900 },
];

const CampaignChart = () => {
  return (
    <Card className="h-full flex flex-col">
      <CardHeader>
        <CardTitle>Campaign Performance</CardTitle>
        <CardDescription>Last 7 days</CardDescription>
      </CardHeader>
      <CardBody className="flex-grow">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={mockData} margin={{ top: 5, right: 0, left: -25, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.2} />
            <XAxis dataKey="name" fontSize={12} tickLine={false} axisLine={false} />
            <YAxis fontSize={12} tickLine={false} axisLine={false} unit="k" />
            <RechartsTooltip
              cursor={{ fill: 'rgba(var(--primary-500-rgb), 0.1)' }}
              contentStyle={{
                backgroundColor: 'hsl(var(--background))',
                borderColor: 'hsl(var(--border))',
                borderRadius: 'var(--radius)',
              }}
            />
            <Bar dataKey="value" fill="hsl(var(--primary-500))" radius={[4, 4, 0, 0]} barSize={20} />
          </BarChart>
        </ResponsiveContainer>
      </CardBody>
    </Card>
  );
};

export default CampaignChart;
