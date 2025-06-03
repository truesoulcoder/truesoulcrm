// src/hooks/useSafeOperation.ts
import { useState, useCallback } from 'react';

export function useSafeOperation<T extends any[]>(
  operation: (...args: T) => Promise<void>
): [boolean, (...args: T) => Promise<void>] {
  const [isLoading, setIsLoading] = useState(false);

  const safeOperation = useCallback(async (...args: T) => {
    setIsLoading(true);
    try {
      await operation(...args);
    } catch (error) {
      console.error('Operation failed:', error);
      throw error; // Re-throw to allow component-level error handling
    } finally {
      setIsLoading(false);
    }
  }, [operation]);

  return [isLoading, safeOperation];
}