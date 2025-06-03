"use client";

import { Session, User } from '@supabase/supabase-js';
import { useRouter, usePathname } from 'next/navigation';
import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';

import { getSupabaseSession } from '@/lib/auth';
import { supabase } from '@/lib/supabase/client';

interface UserContextType {
  user: User | null;
  session: Session | null;
  role: string | null;
  isLoading: boolean;
  error: string | null;
}

interface ErrorWithMessage {
  message: string;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

const getUserRole = (user: User | null): string => {
  if (!user) {
    console.log("[getUserRole] No user object, returning 'guest'.");
    return 'guest';
  }

  const userEmail = user.email?.toLowerCase() || '';
  const allowedDomain = '@truesoulpartners.com';
  
  if (!userEmail.endsWith(allowedDomain)) {
    console.log(`[getUserRole] Unauthorized email domain for user: ${userEmail}`);
    return 'guest';
  }

  if (user.app_metadata?.role) {
    const roleFromMeta = user.app_metadata.role as string;
    console.log(`[getUserRole] Found role in app_metadata: '${roleFromMeta}'`);
    
    if (['superadmin', 'user', 'guest'].includes(roleFromMeta)) {
      return roleFromMeta;
    }
  }
  
  console.log("[getUserRole] No valid role found. Defaulting to 'user' for domain user.");
  return 'user'; // Default to 'user' for valid domain users
};

function isErrorWithMessage(error: unknown): error is ErrorWithMessage {
  return (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof (error as ErrorWithMessage).message === 'string'
  );
}

function getErrorMessage(error: unknown): string {
  if (isErrorWithMessage(error)) return error.message;
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'Unknown error';
}

export const UserProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const pathname = usePathname() || '';

  useEffect(() => {
    const isMounted = true;
    console.log("[UserProvider] Initializing. Current path:", pathname);

    const { data: authListener } = supabase.auth.onAuthStateChange(async (event, newSession) => {
      if (!isMounted) return;
      
      console.log('[UserProvider] Auth state changed:', event);
      
      try {
        switch (event) {
          case 'SIGNED_IN':
            if (newSession?.user) {
              const userRole = getUserRole(newSession.user);
              setSession(newSession);
              setUser(newSession.user);
              setRole(userRole);
              setIsLoading(false);
              setError(null);
            }
            break;
            
          case 'SIGNED_OUT':
            setSession(null);
            setUser(null);
            setRole('guest');
            setIsLoading(false);
            setError(null);
            
            // Only redirect if not already on auth pages
            if (pathname !== '/' && pathname !== '/login') {
              router.replace('/');
            }
            break;
            
          case 'USER_UPDATED':
            if (newSession?.user) {
              const userRole = getUserRole(newSession.user);
              setUser(newSession.user);
              setRole(userRole);
            }
            break;
        }
      } catch (err) {
        console.error('Error in auth state change handler:', err);
        if (isMounted) {
          setError(getErrorMessage(err));
        }
      }
    });

    const initializeAuth = async () => {
      try {
        const {
          data: { session },
          error: sessionError
        } = await supabase.auth.getSession();

        if (sessionError) throw sessionError;

        setSession(session);
        setUser(session?.user ?? null);
        setRole(session?.user ? getUserRole(session.user) : null);
        setError(null);
      } catch (err) {
        console.error("Error initializing auth:", err);
        if (isMounted) {
          setError(getErrorMessage(err));
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    void initializeAuth();

//    return () => {
//      isMounted = false;
//      const subscription = authListener?.subscription;
//      if (subscription?.unsubscribe) {
//        try {
//          const result = subscription.unsubscribe();
//          if (typeof result?.catch === 'function') {
//            result.catch((error: unknown) => {
//              console.error("Error unsubscribing auth listener:", getErrorMessage(error));
//            });
//          }
//        } catch (err: unknown) {
//          console.error('Error during auth cleanup:', getErrorMessage(err));
//        }
//      }
//    };
  }, [pathname, router]);

  if (isLoading && !session) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-base-100">
        <span className="loading loading-spinner loading-lg text-primary"></span>
        <p className="mt-4 text-lg">Loading...</p>
      </div>
    );
  }

  return (
    <UserContext.Provider value={{ user, session, role, isLoading, error }}>
      {children}
    </UserContext.Provider>
  );
};

export const useUser = () => {
  const context = useContext(UserContext);
  if (context === undefined) {
    throw new Error('useUser must be used within a UserProvider');
  }
  return context;
};