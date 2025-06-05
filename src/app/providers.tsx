'use client';

import { ReactNode } from 'react';
import { HeroUIProvider } from '@heroui/react'
import { ThemeProvider } from '@/contexts/ThemeContext';

export default function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      <HeroUIProvider>
      {children}
    </HeroUIProvider>
    </ThemeProvider>
    
  );
}
