"use client";

import { HeroUIProvider, ToastProvider } from "@heroui/react";
import { usePathname } from "next/navigation";
import { useEffect } from 'react';
import MainAppShell from '@/components/layout/MainAppShell';
import { ThemeProvider, useThemeContext } from '@/contexts/ThemeContext';

function AppContent({ children }: { children: React.ReactNode }) {
    const { resolvedTheme } = useThemeContext();
    const pathname = usePathname();
    const isPublicPage = ['/'].includes(pathname);

    useEffect(() => {
        document.documentElement.setAttribute('data-theme', resolvedTheme);
    }, [resolvedTheme]);

    if (isPublicPage) {
        return <>{children}</>;
    }

    return <MainAppShell>{children}</MainAppShell>;
}


export default function ClientLayout({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <HeroUIProvider>
        {/* The ToastProvider is still commented out for this test */}
        {/* <ToastProvider> */}
            <AppContent>{children}</AppContent>
        {/* </ToastProvider> */}
      </HeroUIProvider>
    </ThemeProvider>
  );
}