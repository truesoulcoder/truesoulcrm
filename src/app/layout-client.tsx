"use client";

import { HeroUIProvider, ToastProvider } from "@heroui/react";
import { usePathname } from "next/navigation";
import { useEffect } from 'react';

import MainAppShell from '@/components/layout/MainAppShell';
import { ThemeProvider, useThemeContext } from '@/contexts/ThemeContext';

// Define which paths are public and should not have the sidebar/navbar
const publicPaths = ['/'];

// This new component will correctly apply the theme and decide whether to show the App Shell
function AppStructure({ children }: { children: React.ReactNode }) {
  const { resolvedTheme } = useThemeContext();
  const pathname = usePathname();
  const isPublicPage = publicPaths.includes(pathname);

  // Apply theme to the root <html> element
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', resolvedTheme);
  }, [resolvedTheme]);

  // If it's a public page, show only the page content.
  // Otherwise, wrap the page content in the MainAppShell.
  if (isPublicPage) {
    return <>{children}</>;
  }
  
  return <MainAppShell>{children}</MainAppShell>;
}


export default function ClientLayout({ children }: { children: React.ReactNode }) {
  return (
    // Wrap the app in all the necessary providers
    <ThemeProvider>
      <HeroUIProvider>
        <ToastProvider>
          <AppStructure>{children}</AppStructure>
        </ToastProvider>
      </HeroUIProvider>
    </ThemeProvider>
  );
}