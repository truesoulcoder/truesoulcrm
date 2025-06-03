// src/app/enginecontrol/page.tsx
'use client';
import EngineControlView from '@/components/views/EngineControlView';

export default function EngineControlPage() {
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Engine Control</h1>
      </div>
      <div className="space-y-4">
        <EngineControlView />
      </div>
    </div>
  );
}