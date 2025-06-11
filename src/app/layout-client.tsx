"use client";

import { HeroUIProvider } from "@heroui/react";
import { useRouter } from "next/navigation";

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  // The HeroUIProvider now wraps the application's children directly.
  // The old MainAppShell has been removed to resolve the component conflict
  // and ensure only the new bento dashboard UI is rendered.
  return (
    <HeroUIProvider navigate={router.push}>
      {children}
    </HeroUIProvider>
  );
}