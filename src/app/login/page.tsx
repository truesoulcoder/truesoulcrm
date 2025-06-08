'use client';

import { useRouter } from 'next/navigation';
import { useContext, useEffect, useState } from 'react';
import { UserContext } from '@/contexts/UserContext';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

async function invokeSetRole() {
  const { data, error } = await supabase.functions.invoke('set-truesoul-role', {
    body: { name: 'Functions' },
  });

  if (error) {
    console.error('Function invocation error:', error);
    throw new Error(`Function failed: ${error.message}`);
  }
  
  return data;
}

export default function LoginPage() {
  const router = useRouter();
  const { user, loading } = useContext(UserContext);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (user && !loading) {
      router.push('/dashboard');
    }
  }, [user, loading, router]);

  const handleLogin = async () => {
    try {
      setIsLoading(true);
      const { error, session } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
          queryParams: {
            access_type: 'offline',
            prompt: 'consent',
          },
        },
      });
      
      if (error) throw error;
      if (session) {
        // Redirect to dashboard after successful sign-in
        router.push('/dashboard');
      }
    } catch (err) {
      console.error('Error signing in with Google:', err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden">
      <div className="card w-96 bg-base-100/80 backdrop-blur-sm shadow-xl border border-base-200">
        <div className="card-body items-center text-center p-10">
          {/* Logo */}
          <div className="mb-8">
            <div className="text-4xl font-bold text-primary">True Soul CRM</div>
          </div>
          
          {/* Google Sign In Button */}
          <button
            onClick={() => void handleLogin()}
            disabled={isLoading}
            className="btn btn-neutral w-full"
          >
            {isLoading ? (
              <span className="loading loading-spinner"></span>
            ) : (
              <>
                <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24">
                  <path
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    fill="#4285F4"
                  />
                  <path
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    fill="#34A853"
                  />
                  <path
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
                    fill="#FBBC05"
                  />
                  <path
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                    fill="#EA4335"
                  />
                </svg>
                Sign in with Google
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
