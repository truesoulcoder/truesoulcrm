'use client';

import dynamic from 'next/dynamic';
import { ComponentType } from 'react';
import { ThemeToggle } from './ThemeToggle';

export default function CampaignDashboardWrapper() {
  const CampaignDashboard = dynamic(
    () => import('@/components/campaign-dashboard')
      .then((mod) => {
        if (!mod.default) {
          throw new Error('Failed to load CampaignDashboard component');
        }
        return mod.default as ComponentType<{}>;
      }),
    { 
      ssr: false,
      loading: () => <div className="flex-1 p-4 md:p-6">Loading dashboard...</div>
    }
  );

  return (
    <>
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>
      <CampaignDashboard />
    </>
  );
}
