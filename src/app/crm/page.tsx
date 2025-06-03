// src/app/crm/page.tsx
"use client";

import GoogleMapsLoader from '@/components/maps/GoogleMapsLoader';
import CrmView from '@/components/views/CrmView';

export const dynamic = 'force-dynamic';

export default function CrmPage() {
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">CRM</h1>
      </div>
      <div className="space-y-4 h-[calc(100vh-12rem)]">
        <GoogleMapsLoader>
          <div className="w-full h-full">
            <CrmView />
          </div>
        </GoogleMapsLoader>
      </div>
    </div>
  );
}