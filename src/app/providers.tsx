'use client';

import { ReactNode } from 'react';

import { ThemeProvider } from '@/contexts/ThemeContext';

export default function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      {children}
    </ThemeProvider>
  );
}