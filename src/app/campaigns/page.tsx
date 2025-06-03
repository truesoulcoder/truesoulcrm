'use client';
import dynamic from 'next/dynamic';

const CampaignsView = dynamic(
  () => import('@/components/views/CampaignsView'),
  { ssr: false }
);

export default function CampaignsPage() {
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Campaign Management</h1>
      </div>
      <div className="space-y-4">
        <CampaignsView />
      </div>
    </div>
  );
}