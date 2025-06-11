'use client';

// 1. Import the new main dashboard component
import { CampaignDashboard } from '@/components/campaign_dashboard/campaign-dashboard';

// 2. The dashboard page now simply renders the new UI.
export default function DashboardPage() {
  return (
      <CampaignDashboard />
  );
}