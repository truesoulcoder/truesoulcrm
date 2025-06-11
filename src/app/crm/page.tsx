// src/app/crm/page.tsx
"use client";

// The CRM page now also just renders the new, powerful table via the CrmView.
import CrmViewInner from '@/components/views/CrmView';
import GoogleMapsLoader from '@/components/maps/GoogleMapsLoader';

export default function CrmPage() {
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">CRM</h1>
      </div>
      <div className="space-y-4 h-[calc(100vh-12rem)]">
        <GoogleMapsLoader>
          <CrmViewInner />
        </GoogleMapsLoader>
      </div>
    </div>
  );
}