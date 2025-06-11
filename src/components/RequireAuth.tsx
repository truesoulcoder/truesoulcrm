"use client";

import { useRouter, usePathname } from "next/navigation";
import { useEffect, ReactNode } from "react";
import { useUser } from "@/contexts/UserContext";
import { Spinner } from "@heroui/react";

const AuthLoading = () => (
  <div className="flex items-center justify-center h-screen w-screen bg-background">
    <div className="flex flex-col items-center gap-4">
      <Spinner size="lg" />
      <p className="text-lg">Loading Application...</p>
    </div>
  </div>
);

export default function RequireAuth({ children }: { children: ReactNode }) {
  const { user, isLoading, role, error } = useUser();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    // Wait until the initial loading is complete before doing any checks
    if (isLoading) {
      return;
    }

    const isPublicPath = pathname === '/';

    // If there is no user, they should be on the login page.
    // If they are on a protected page, redirect them to login.
    if (!user && !isPublicPath) {
      router.replace('/');
      return;
    }

    // If the user is logged in, they should NOT be on the login page.
    // Redirect them to the appropriate dashboard based on their role.
    if (user && isPublicPath) {
      if (role === 'superadmin') {
        router.replace('/dashboard');
      } else {
        router.replace('/crm');
      }
      return;
    }
    
    // Add a specific check for guests trying to access pages other than the CRM.
    if (user && role === 'guest' && pathname !== '/crm' && !isPublicPath) {
        router.replace('/crm');
    }

  }, [isLoading, user, role, pathname, router]);

  // While the initial user state is being determined, show a loading screen.
  if (isLoading) {
    return <AuthLoading />;
  }
  
  // If an error occurred in the user context, display it.
  if (error) {
     return (
      <div className="flex flex-col items-center justify-center h-screen text-center p-4">
        <p className="text-lg text-danger-500">Authentication Error</p>
        <p className="text-sm mt-2">{error}</p>
      </div>
    );
  }

  // If there's no user but they are on the public login page, let them see it.
  if (!user && pathname === '/') {
    return <>{children}</>;
  }

  // If there is a user and they are on a valid, protected page, show the content.
  if (user && pathname !== '/') {
    // Also ensure a guest user can only see the CRM page
    if (role === 'guest' && pathname !== '/crm') {
       return <AuthLoading />; // Show loading while redirecting
    }
    return <>{children}</>;
  }
  
  // In all other cases (like waiting for a redirect), show the loading screen.
  return <AuthLoading />;
}