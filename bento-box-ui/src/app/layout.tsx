"use client"
import { Providers } from './providers'
import './globals.css'

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className="h-full" suppressHydrationWarning>
      <body className="h-full">
        <Providers>
          <div className="min-h-full">
            {children}
          </div>
        </Providers>
      </body>
    </html>
  );
}