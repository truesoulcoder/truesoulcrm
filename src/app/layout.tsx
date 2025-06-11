// src/app/layout.tsx
import { Inter } from 'next/font/google';
import { UserProvider } from '@/contexts/UserContext';
import { HeroUIProvider } from '@heroui/react';
import type { Metadata } from 'next';
import './globals.css';
import EdgeFunctionTriggerProvider from '@/components/EdgeFunctionTriggerProvider';
import RequireAuth from '@/components/RequireAuth';
import NavbarNew from '@/components/layout/NavbarNew';
import { Toaster } from 'react-hot-toast';
import GoogleMapsLoader from '@/components/maps/GoogleMapsLoader'; // Import the loader

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'True Soul CRM',
  description: 'CRM Administration Panel',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        <UserProvider>
          <HeroUIProvider>
            {/* Wrap the core authenticated layout with GoogleMapsLoader */}
            <GoogleMapsLoader>
              <EdgeFunctionTriggerProvider />
              <RequireAuth>
                <div className="flex flex-col h-screen bg-background text-foreground">
                  <NavbarNew />
                  <main className="flex-1 overflow-y-auto p-4 sm:p-6">
                    {children}
                  </main>
                  <Toaster position="bottom-right" />
                </div>
              </RequireAuth>
            </GoogleMapsLoader>
          </HeroUIProvider>
        </UserProvider>
      </body>
    </html>
  );
}