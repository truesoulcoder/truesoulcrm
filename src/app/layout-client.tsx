"use client";

// import { HeroUIProvider } from "@heroui/react"; // No longer directly used here
import { useRouter } from "next/navigation";
import Providers from './providers'; // Import the Providers component

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  // The HeroUIProvider now wraps the application's children directly.
  // The old MainAppShell has been removed to resolve the component conflict
  // and ensure only the new bento dashboard UI is rendered.
  // Now, Providers component wraps children and handles HeroUIProvider internally.
  return (
    <Providers navigate={router.push}>
      {children}
    </Providers>
  );
}