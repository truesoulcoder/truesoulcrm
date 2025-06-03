// src/hooks/useEngineControl.ts
'use client';

import { useState, useCallback } from 'react';

export type EngineStatus = 'idle' | 'starting' | 'running' | 'stopping' | 'error';

export function useEngineControl() {
  const [status, setStatus] = useState<EngineStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [isStopping, setIsStopping] = useState(false);

  const startEngine = useCallback(async () => {
    setIsStarting(true);
    setError(null);
    try {
      setStatus('starting');
      // Your engine start logic here
      setStatus('running');
    } catch (err) {
      setStatus('error');
      setError(err instanceof Error ? err.message : 'Failed to start engine');
    } finally {
      setIsStarting(false);
    }
  }, []);

  const stopEngine = useCallback(async () => {
    setIsStopping(true);
    try {
      setStatus('stopping');
      // Your engine stop logic here
      setStatus('idle');
    } catch (err) {
      setStatus('error');
      setError(err instanceof Error ? err.message : 'Failed to stop engine');
    } finally {
      setIsStopping(false);
    }
  }, []);

  return {
    status,
    startEngine,
    stopEngine,
    error,
    isStarting,
    isStopping,
  };
}