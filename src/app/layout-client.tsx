// src/app/layout-client.tsx
"use client";

import { HeroUIProvider } from "@heroui/react";
import { usePathname } from "next/navigation";
import MainAppShell from '@/components/layout/MainAppShell';
import { useRouter } from "next/navigation";

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const isPublicPage = ['/'].includes(pathname);

  // The HeroUIProvider now reads its configuration from your new tailwind.config.js
  // It will automatically handle applying theme classes to the HTML element.
  return (
    <HeroUIProvider navigate={router.push}>
      {isPublicPage ? <>{children}</> : <MainAppShell>{children}</MainAppShell>}
    </HeroUIProvider>
  );
}