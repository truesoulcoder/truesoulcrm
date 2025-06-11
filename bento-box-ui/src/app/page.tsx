import { Metadata } from 'next';
import CampaignDashboardWrapper from '@/components/campaign-dashboard-wrapper';

export const metadata: Metadata = {
  title: 'Dashboard | TrueSoul CRM',
  description: 'Campaign management dashboard',
};

export default function HomePage() {
  return (
    <main className="flex-1 p-4 md:p-6">
      <CampaignDashboardWrapper />
    </main>
  );
}