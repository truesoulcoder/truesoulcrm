// src/app/settings/page.tsx
'use client';
import dynamic from 'next/dynamic';

const SettingsView = dynamic(
  () => import('@/components/views/SettingsView'),
  { ssr: false }
);

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Settings</h1>
      </div>
      <div className="space-y-4">
        <SettingsView />
      </div>
    </div>
  );
}