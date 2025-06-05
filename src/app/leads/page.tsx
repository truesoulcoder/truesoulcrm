// src/app/leads/page.tsx
'use client';
import LeadsView from '@/components/views/LeadsView';
import TableExample from '@/components/layout/TableExample';

export default function LeadsPage() {
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Lead Management</h1>
      </div>
      <div className="space-y-4">
        <LeadsView />
        <TableExample />
      </div>
    </div>
  );
}