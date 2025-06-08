"use client";

import { Session, Subscription, User } from '@supabase/supabase-js';
import { useRouter, usePathname } from 'next/navigation';
import React, { createContext, useContext, useEffect, useState, ReactNode, useRef } from 'react';

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

const getUserRole = async (userId: string) => {
  try {
    const response = await fetch(`/api/user/${userId}/role`);
    if (!response.ok) {
      throw new Error(`Failed to fetch user role: ${response.status}`);
    }
    const { role } = await response.json();
    return role;
  } catch (error) {
    console.error('[getUserRole] Unexpected error:', error);
    return null;
  }
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
  const authListenerRef = useRef<Subscription>(null);

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
              const userRole = await getUserRole(newSession.user.id);
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
              const userRole = await getUserRole(newSession.user.id);
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

    // Store listener for cleanup
    authListenerRef.current = authListener;

    const initializeAuth = async () => {
      try {
        const {
          data: { session },
          error: sessionError
        } = await supabase.auth.getSession();

        if (sessionError) throw sessionError;

        setSession(session);
        setUser(session?.user ?? null);
        setRole(session?.user ? await getUserRole(session.user.id) : null);
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

    // Cleanup function
    return () => {
      if (authListenerRef.current) {
        authListenerRef.current.unsubscribe();
      }
    };
  }, [router, pathname]);

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