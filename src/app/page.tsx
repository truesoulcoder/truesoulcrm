// src/app/page.tsx
"use client";

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { useUser } from '@/contexts/UserContext';
import { supabase } from '@/lib/supabase/client';

export default function LoginPage() {
  const { user, role, isLoading, error: userContextError } = useUser();
  const router = useRouter();
  const [loginError, setLoginError] = useState<string | null>(null);

  const handleGoogleLogin = async () => {
    setLoginError(null);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin,
      },
    });
    if (error) {
      console.error('Error logging in with Google:', error);
      setLoginError(`Login failed: ${error.message}`);
    }
  };

  useEffect(() => {
    if (!isLoading && user && role) {
      // Redirect only when we have a user and a definitive role
      if (role === 'superadmin') {
        router.replace('/dashboard');
      } else if (role === 'crmuser' || role === 'guest') {
        router.replace('/crm');
      } else {
        // Fallback for any other roles or if logic needs to be expanded
        router.replace('/dashboard');
      }
    }
  }, [user, isLoading, role, router]);

  // Show a loading spinner while the UserContext is initializing
  if (isLoading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-base-100">
        <span className="loading loading-spinner loading-lg text-primary"></span>
        <p className="mt-4 text-lg">Loading application...</p>
      </div>
    );
  }

  // If we have a user but are waiting for the role, show a redirecting message.
  // This handles the race condition.
  if (user && !isLoading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-base-100">
        <span className="loading loading-spinner loading-lg text-primary"></span>
        <p className="mt-4 text-lg">Authenticated. Redirecting...</p>
      </div>
    );
  }

  // If no user, show the login page.
  return (
    <div className="hero min-h-screen bg-base-200">
      <div className="hero-content text-center">
        <div className="max-w-md">
          <h1 className="text-5xl font-bold">CRM Admin</h1>
          <p className="py-6">
            Please log in with your Google account to access the dashboard.
          </p>
          {userContextError && (
              <p className="text-error mb-4">Error initializing user: {userContextError}</p>
          )}
          <button
            onClick={() => { handleGoogleLogin().catch(err => console.error("Google login onClick handler error:", err)); }}
            className="btn btn-primary btn-lg"
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