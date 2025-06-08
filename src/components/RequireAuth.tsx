"use client";

import { useRouter, usePathname } from "next/navigation";
import { useEffect, ReactNode, useState } from "react";
import { useUser } from "@/contexts/UserContext";

// An array of paths that do not require authentication.
const publicPaths = ['/']; 

// A loading component to be displayed while checking auth status.
const AuthLoading = () => (
  <div className="flex items-center justify-center h-screen text-center">
    <p className="text-lg">Loading application...</p>
    <span className="loading loading-spinner loading-lg ml-2"></span>
  </div>
);

/**
 * A client component that wraps protected routes to enforce authentication and role-based access.
 * It redirects users based on their session status and role.
 * @param {ReactNode} children - The child components to render if authentication is successful.
 */
export default function RequireAuth({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, role, isLoading: isUserContextLoading, error } = useUser();
  const [isRedirecting, setIsRedirecting] = useState(false);

  useEffect(() => {
    // Wait until the user context has finished loading.
    if (isUserContextLoading) {
      return;
    }

    const isPublicPath = publicPaths.includes(pathname);
    let targetPath: string | null = null;

    if (!user) {
      // If the user is not logged in and not on a public path, redirect to the login page.
      if (!isPublicPath) {
        targetPath = '/';
      }
    } else {
      // User is logged in.
      // If they are on a public path (like the login page), redirect them to their dashboard.
      if (isPublicPath) {
        targetPath = '/dashboard';
      }
      // If the user has the 'guest' role and is trying to access a non-CRM page, redirect them to the CRM.
      else if (role === 'guest' && pathname !== '/crm') {
        targetPath = '/crm';
      }
    }

    if (targetPath) {
      setIsRedirecting(true);
      router.replace(targetPath);
    }
  }, [user, role, isUserContextLoading, pathname, router]);

  // Display a loading indicator while the auth check or redirection is in progress.
  if (isUserContextLoading || isRedirecting) {
    return <AuthLoading />;
  }

  // If there was an error fetching user data, display an error message.
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-screen text-center p-4">
        <p className="text-lg text-error">Authentication Error</p>
        <p className="text-sm mt-2">{error}</p>
      </div>
    );
  }

  // If the user is not logged in and is on a public path, render the children (e.g., the login page).
  if (!user && publicPaths.includes(pathname)) {
    return <>{children}</>;
  }

  // If the user is logged in and no redirection is needed, render the protected content.
  if (user) {
    return <>{children}</>;
  }

  // Fallback, should ideally not be reached. Shows loading while waiting for redirect.
  return <AuthLoading />;
}