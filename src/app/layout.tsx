// src/app/layout.tsx
import { Inter } from 'next/font/google';
import { UserProvider } from '@/contexts/UserContext';
import ClientLayout from './layout-client';
import type { Metadata } from 'next';
import './globals.css';
import EdgeFunctionTriggerProvider from '@/components/EdgeFunctionTriggerProvider';
import RequireAuth from '@/components/RequireAuth';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'CRM Admin',
  description: 'CRM Administration Panel',
};

export function generateViewport() {
  return {
    width: 'device-width',
    initialScale: 1.0,
  };
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    // REMOVED data-theme="dark" attribute
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        <EdgeFunctionTriggerProvider />
        <UserProvider>
          <RequireAuth>
            <ClientLayout>{children}</ClientLayout>
          </RequireAuth>
        </UserProvider>
      </body>
    </html>
  );
}