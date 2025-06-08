// src/app/page.tsx
"use client";

import { useEffect } from 'react';
import { useUser } from '@/contexts/UserContext';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const { user, role, isLoading, error: userContextError } = useUser();
  const router = useRouter();

  // This function initiates the server-side Google OAuth flow.
  const handleGoogleLogin = () => {
    // Redirects the user to the backend route that starts the Supabase OAuth process.
    window.location.href = '/api/auth/google';
  };

  useEffect(() => {
    // This effect is now redundant because of the RequireAuth component,
    // but as a fallback, we can keep a simple version.
    // The RequireAuth component will handle redirection more effectively.
    if (!isLoading && user && role) {
      if (role === 'superadmin' || role === 'admin') {
        router.replace('/dashboard');
      } else {
        router.replace('/crm');
      }
    }
  }, [user, role, isLoading, router]);


  // Display a loading screen while the initial user/role check is in progress.
  // This is handled globally by UserProvider and RequireAuth, but good for initial page load.
  if (isLoading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-base-100">
        <span className="loading loading-spinner loading-lg text-primary"></span>
        <p className="mt-4 text-lg">Loading Application...</p>
      </div>
    );
  }

  // The RequireAuth component will redirect authenticated users away from this page.
  // This UI will only be visible to unauthenticated users.
  return (
    <div className="hero min-h-screen bg-base-200">
      <div className="hero-content text-center">
        <div className="max-w-md">
          <h1 className="text-5xl font-bold">True Soul CRM</h1>
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