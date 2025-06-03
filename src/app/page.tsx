"use client";

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { useUser } from '@/contexts/UserContext';
import { supabase } from '@/lib/supabase/client'; // For Google OAuth

export default function LoginPage() {
  const { user, role, isLoading, error: userContextError } = useUser();
  const router = useRouter();
  const [loginError, setLoginError] = useState<string | null>(null);

  const handleGoogleLogin = async () => {
    setLoginError(null);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin, // Dynamically sets redirect to current host
                                              // Ensure this URL (e.g., http://localhost:3000) is in your Supabase project's allow list
      },
    });
    if (error) {
      console.error('Error logging in with Google:', error);
      setLoginError(`Login failed: ${error.message}`);
    }
  };

  useEffect(() => {
    if (!isLoading) {
      if (user) {
        // User is logged in, redirect based on role
        if (role === 'superadmin') {
          console.log("[LoginPage] Superadmin found, redirecting to /dashboard");
          router.replace('/dashboard');
        } else if (role === 'guest') { // crm user
          console.log(`[LoginPage] Authenticated user (role: ${role}), redirecting to /crm`);
          router.replace('/crm');
        }
        // If user exists but role is 'guest' or still null, they stay here,
        // which might indicate an issue or a state where login should be re-attempted.
        // Or, UserProvider might eventually update the role and this useEffect will re-run.
      }
      // If !user (and not loading), we stay on this page to show the login button.
    }
  }, [user, isLoading, role, router]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-base-100">
        <span className="loading loading-spinner loading-lg text-primary"></span>
        <p className="mt-4 text-lg">Loading application...</p>
      </div>
    );
  }

  // Show login UI only if not loading and no user
  if (!user) {
    return (
      <div className="hero min-h-screen bg-base-200">
        <div className="hero-content text-center">
          <div className="max-w-md">
            <h1 className="text-5xl font-bold">CRM Admin</h1>
            <p className="py-6">
              Please log in with your Google account to access the dashboard.
            </p>
            {userContextError && (
                <p className="text-error mb-4">Error initializing user: {typeof userContextError === 'string' ? userContextError : (userContextError as Error)?.message || 'Unknown error'}</p>
            )}
            <button
              onClick={() => { handleGoogleLogin().catch(err => console.error("Google login onClick handler error:", err)); }}
              className="btn btn-primary btn-lg"
              disabled={isLoading} // Though isLoading is handled above, good practice
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor" className="mr-2"><path d="M20.283 10.356h-8.327v3.451h4.792c-.446 2.193-2.313 3.453-4.792 3.453a5.27 5.27 0 0 1-5.279-5.28 5.27 5.27 0 0 1 5.279-5.279c1.259 0 2.397.447 3.29 1.178l2.6-2.599c-1.584-1.381-3.615-2.233-5.89-2.233a8.908 8.908 0 0 0-8.934 8.934 8.907 8.907 0 0 0 8.934 8.934c4.955 0 8.687-3.466 8.687-8.949A8.826 8.826 0 0 0 20.283 10.356z"></path></svg>
              Login with Google
            </button>
            {loginError && (
              <p className="text-error mt-4">{loginError}</p>
            )}
          </div>
        </div>
      </div>
    );
  }

  // If user is loaded and exists, useEffect handles redirection.
  // Render a minimal loader during that brief period if redirection isn't instantaneous.
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-base-100">
      <span className="loading loading-spinner loading-lg text-primary"></span>
      <p className="mt-4 text-lg">Redirecting...</p>
    </div>
  );
}
