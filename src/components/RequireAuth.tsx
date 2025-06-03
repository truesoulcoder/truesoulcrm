"use client";

import Head from 'next/head';
import { useRouter, usePathname } from "next/navigation";
import { useEffect, useRef, ReactNode } from "react";

import { useUser } from "@/contexts/UserContext";

// Define public paths that don't require authentication
const publicPaths = ['/'];

// Define role-based redirects
const getRedirectPath = (role: string | null, currentPath: string): string | null => {
  // If user is a guest, only allow access to /crm path
  if (role === 'guest') {
    return currentPath === '/crm' ? null : '/crm';
  }
  
  // If user is authenticated (has a role) and is on the login page, redirect to dashboard
  if (role && role !== 'guest' && currentPath === '/') {
    return '/dashboard';
  }
  
  // If user has no role and is not on the login page, redirect to login
  if (!role && currentPath !== '/') {
    return '/';
  }
  
  return null;
};

export default function RequireAuth({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, role, isLoading, error: userContextError } = useUser();

  // Track if we've already handled the redirect
  const redirectHandledRef = useRef(false);

  useEffect(() => {
    if (isLoading || redirectHandledRef.current) return;
    
    // Handle redirection based on authentication status and role
    if (!user) {
      // If not logged in and not on a public path, redirect to login
      if (!publicPaths.includes(pathname)) {
        redirectHandledRef.current = true;
        window.location.href = '/';
      }
    } else {
      // If logged in, check role-based redirection
      const redirectPath = getRedirectPath(role, pathname);
      if (redirectPath) {
        redirectHandledRef.current = true;
        window.location.href = redirectPath;
      }
    }
    
    // Reset the flag after a short delay to allow future redirects if needed
    const timer = setTimeout(() => {
      redirectHandledRef.current = false;
    }, 1000);
    
    return () => clearTimeout(timer);
  }, [user, role, isLoading, pathname]);

  if (isLoading) {
    return (
      <>
        <Head>
          <title>Loading User...</title>
        </Head>
        <div className="flex items-center justify-center h-screen text-center">
          <p className="text-lg">Loading application...</p>
          <span className="loading loading-spinner loading-lg ml-2"></span>
        </div>
      </>
    );
  }

  if (userContextError) {
    return (
      <>
        <Head>
          <title>Authentication Error</title>
        </Head>
        <div className="flex flex-col items-center justify-center h-screen text-center p-4">
          <p className="text-lg text-red-600">Authentication Error</p>
          <p className="text-sm text-gray-700 mt-2">
            There was an issue loading your user information: {userContextError}
          </p>
          <p className="text-sm text-gray-500 mt-1">
            Please try refreshing the page or contact support if the problem persists.
          </p>
        </div>
      </>
    );
  }

  if (!user && pathname !== '/') {
    // The useEffect hook handles redirection. This state should be brief.
    // Display a placeholder while redirecting.
    return (
      <>
        <Head>
          <title>Redirecting...</title>
        </Head>
        <div className="flex items-center justify-center h-screen text-center">
          <p className="text-lg">Redirecting to login page...</p>
        </div>
      </>
    );
  }

  // If user is authenticated, or if it's the login page itself (even if !user), render children.
  return <>{children}</>;
}
