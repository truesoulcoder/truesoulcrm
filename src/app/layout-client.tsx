"use client";

import { useEffect } from 'react';

import MainAppShell from '@/components/layout/MainAppShell';
import { ThemeProvider as ActualStatefulThemeProvider } from '@/contexts/ThemeContext';
import { useTheme } from '@/hooks/useTheme';

function ThemeEffectAndAppShell({ children }: { children: React.ReactNode }) {
  const { theme } = useTheme();

  useEffect(() => {
    const root = document.documentElement;

    if (theme && theme !== 'system') {
      root.setAttribute('data-theme', theme);
    } else {
      if (typeof window !== 'undefined') {
        const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
        root.setAttribute('data-theme', systemTheme);
      }
    }
  }, [theme]);

  return <MainAppShell>{children}</MainAppShell>;
}

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  return (
    <ActualStatefulThemeProvider>
      <ThemeEffectAndAppShell>{children}</ThemeEffectAndAppShell>
    </ActualStatefulThemeProvider>
  );
}

