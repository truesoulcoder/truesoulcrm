"use client";

import { useEffect } from 'react';

import MainAppShell from '@/components/layout/MainAppShell';
// Ensure this is the provider that manages theme state (e.g., using useState)
import { ThemeProvider as ActualStatefulThemeProvider } from '@/contexts/ThemeContext';
import { useTheme } from '@/hooks/useTheme';

// Renamed the inner component that consumes the theme and applies DOM effects
function ThemeEffectAndAppShell({ children }: { children: React.ReactNode }) {
  const { theme } = useTheme(); // Consumes theme from ActualStatefulThemeProvider

  useEffect(() => {
    const root = document.documentElement;
    // Removed: root.removeAttribute('class'); as it might interfere with other styling.
    // DaisyUI uses data-theme, so managing that attribute is sufficient.

    if (theme && theme !== 'system') {
      root.setAttribute('data-theme', theme);
    } else {
      // This branch handles theme === 'system' or if theme is initially undefined/null.
      // It relies on window, so it's client-side only.
      if (typeof window !== 'undefined') {
        const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
        root.setAttribute('data-theme', systemTheme);
      }
      // If window is not defined (e.g. during SSR before hydration), data-theme might not be set here.
      // This is usually fine as it will be set on hydration.
      // Consider setting a default theme via <html data-theme="dark"> in the root layout.tsx for SSR.
    }
  }, [theme]);

  return <MainAppShell>{children}</MainAppShell>;
}

// ClientLayout now correctly sets up the ActualStatefulThemeProvider
export default function ClientLayout({ children }: { children: React.ReactNode }) {
  return (
    <ActualStatefulThemeProvider>
      <ThemeEffectAndAppShell>{children}</ThemeEffectAndAppShell>
    </ActualStatefulThemeProvider>
  );
}

