// src/components/views/CrmView.tsx
'use client';

import OmegaTable from '@/components/layout/OmegaTable';

/**
 * CrmView serves as a layout wrapper for the main OmegaTable component.
 */
export default function CrmView() {
  return (
    <div className="w-full h-full">
      <OmegaTable />
    </div>
  );
}