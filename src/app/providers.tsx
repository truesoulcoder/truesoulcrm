'use client';

import { ReactNode } from 'react';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { HeroUIProvider, ToastProvider } from "@heroui/react";

// Add navigate prop
export default function Providers({ children, navigate }: { children: ReactNode, navigate?: (path: string) => void }) {
  return (
    <HeroUIProvider navigate={navigate}> {/* Outermost provider from HeroUI, pass navigate */}
      <ThemeProvider> {/* Your custom theme provider */}
        {/* ToastProvider can be here, it will use the theme context if it's designed to */}
        <ToastProvider /> 
        {children}
      </ThemeProvider>
    </HeroUIProvider>
  );
}
