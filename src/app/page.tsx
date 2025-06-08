// src/app/page.tsx
"use client";

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

import { useUser } from '@/contexts/UserContext';

export default function LoginPage() {
  const { user, role, isLoading, error: userContextError } = useUser();
  const router = useRouter();

  // This function now simply redirects to your backend auth route.
  const handleGoogleLogin = () => {
    window.location.href = '/api/auth/google';
  };

  useEffect(() => {
    if (isLoading) {
      return; // Do nothing while the user context is loading
    }
    
    if (user && role) {
      // Redirect authenticated users with a role
      if (role === 'superadmin') {
        router.replace('/dashboard');
      } else {
        // Default redirect for any other authenticated role
        router.replace('/crm');
      }
    }
  }, [user, role, isLoading, router]);

  // Display a loading screen while the initial user/role check is in progress
  if (isLoading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-base-100">
        <span className="loading loading-spinner loading-lg text-primary"></span>
        <p className="mt-4 text-lg">Loading Application...</p>
      </div>
    );
  }

  // If a user is loaded but the role is still being determined, show a redirecting state.
  if (user && !role) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-base-100">
        <span className="loading loading-spinner loading-lg text-primary"></span>
        <p className="mt-4 text-lg">Authenticated. Redirecting...</p>
      </div>
    );
  }

  // Only show the login page if not loading and no user is authenticated.
  return (
    <div className="hero min-h-screen bg-base-200">
      <div className="hero-content text-center">
        <div className="max-w-md">
          <h1 className="text-5xl font-bold">CRM Admin</h1>
          <p className="py-6">
            Please log in with your Google account to access the dashboard.
          </p>
          {userContextError && (
            <div className="alert alert-error mb-4">
              <div>
                <span>Error initializing user: {userContextError}</span>
              </div>
            </div>
          )}
          <button
            onClick={handleGoogleLogin}
            className="btn btn-primary btn-lg"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor" className="mr-2"><path d="M20.283 10.356h-8.327v3.451h4.792c-.446 2.193-2.313 3.453-4.792 3.453a5.27 5.27 0 0 1-5.279-5.28 5.27 5.27 0 0 1 5.279-5.279c1.259 0 2.397.447 3.29 1.178l2.6-2.599c-1.584-1.381-3.615-2.233-5.89-2.233a8.908 8.908 0 0 0-8.934 8.934 8.907 8.907 0 0 0 8.934 8.934c4.955 0 8.687-3.466 8.687-8.949A8.826 8.826 0 0 0 20.283 10.356z"></path></svg>
            Login with Google
          </button>
        </div>
      </div>
    </div>
  );
}