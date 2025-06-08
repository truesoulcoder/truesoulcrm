// src/components/views/CrmView.tsx
'use client';

import OmegaTable from '@/components/layout/OmegaTable';

/**
 * CrmView now serves as a simple layout wrapper.
 * The OmegaTable component is self-sufficient and handles all its own data fetching and state management.
 */
export default function CrmView() {
  return (
    <div className="w-full h-full">
      <OmegaTable />
    </div>
  );
}