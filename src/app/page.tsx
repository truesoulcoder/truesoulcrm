// src/app/page.tsx
"use client";

import { useEffect } from 'react';
import { useUser } from '@/contexts/UserContext';
import { useRouter } from 'next/navigation';
import { Button } from '@heroui/react'; // Import the HeroUI Button

export default function LoginPage() {
  const { user, role, isLoading, error: userContextError } = useUser();
  const router = useRouter();

  const handleGoogleLogin = () => {
    // This assumes your Google login is configured at this server-side endpoint
    window.location.href = '/api/auth/google'; 
  };

  useEffect(() => {
    // This logic correctly redirects the user once they are fully authenticated with a role
    if (!isLoading && user && role) {
      if (role === 'superadmin') {
        router.replace('/dashboard');
      } else {
        router.replace('/crm');
      }
    }
  }, [user, role, isLoading, router]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background text-foreground">
        {/* You can use a HeroUI spinner here if desired */}
        <p className="mt-4 text-lg">Loading Application...</p>
      </div>
    );
  }

  // Refactored JSX using standard flexbox and HeroUI Button
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background text-foreground p-4">
      <div className="flex flex-col items-center text-center max-w-md w-full">
        <h1 className="text-5xl font-bold">True Soul CRM</h1>
        <p className="py-6">
          Please log in with your Google account to access the dashboard.
        </p>
        {userContextError && (
          <div className="bg-danger/10 text-danger border border-danger rounded-md p-4 mb-4 w-full" role="alert">
            <span>Authentication Error: {userContextError}</span>
          </div>
        )}
        <Button
          onPress={handleGoogleLogin} // HeroUI uses onPress for buttons
          color="primary"
          size="lg"
          className="w-full max-w-xs"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor" className="mr-2">
            <path d="M20.283 10.356h-8.327v3.451h4.792c-.446 2.193-2.313 3.453-4.792 3.453a5.27 5.27 0 0 1-5.279-5.28 5.27 5.27 0 0 1 5.279-5.279c1.259 0 2.397.447 3.29 1.178l2.6-2.599c-1.584-1.381-3.615-2.233-5.89-2.233a8.908 8.908 0 0 0-8.934 8.934 8.907 8.907 0 0 0 8.934 8.934c4.955 0 8.687-3.466 8.687-8.949a8.826 8.826 0 0 0-20.283-10.356z"></path>
          </svg>
          Login with Google
        </Button>
      </div>
    </div>
  );
}