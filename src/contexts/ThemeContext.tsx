// src/contexts/ThemeContext.tsx
'use client';

import { createContext, useContext } from 'react';
import { useTheme, type Theme, type ThemeName } from '@/hooks/useTheme';

interface ThemeContextType extends ReturnType<typeof useTheme> {}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const theme = useTheme();

  return (
    <ThemeContext.Provider value={theme}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useThemeContext() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useThemeContext must be used within a ThemeProvider');
  }
  return context;
}