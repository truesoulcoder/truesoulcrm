"use client";

import { useRouter, usePathname } from "next/navigation";
import { useEffect, ReactNode, useState } from "react";
import { useUser } from "@/contexts/UserContext";

const publicPaths = ['/'];

const AuthLoading = () => (
  <div className="flex items-center justify-center h-screen text-center">
    <p className="text-lg">Loading Application...</p>
    <span className="loading loading-spinner loading-lg ml-2"></span>
  </div>
);

export default function RequireAuth({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, role, isLoading: isUserContextLoading, error } = useUser();
  const [isRedirecting, setIsRedirecting] = useState(false);

  useEffect(() => {
    if (isUserContextLoading) {
      return;
    }

    const isPublicPath = publicPaths.includes(pathname);
    let targetPath: string | null = null;

    if (!user) {
      if (!isPublicPath) {
        targetPath = '/';
      }
    } else {
      if (isPublicPath) {
        targetPath = '/dashboard';
      } else if (role === 'guest' && pathname !== '/crm') {
        targetPath = '/crm';
      }
    }

    if (targetPath) {
      setIsRedirecting(true);
      router.replace(targetPath);
    }
  }, [user, role, isUserContextLoading, pathname, router]);

  if (isUserContextLoading || isRedirecting) {
    return <AuthLoading />;
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-screen text-center p-4">
        <p className="text-lg text-error">Authentication Error</p>
        <p className="text-sm mt-2">{error}</p>
      </div>
    );
  }

  if (!user && publicPaths.includes(pathname)) {
    return <>{children}</>;
  }

  if (user) {
    return <>{children}</>;
  }

  return <AuthLoading />;
}