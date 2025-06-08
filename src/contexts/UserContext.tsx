"use client";

import { Session, Subscription, User } from '@supabase/supabase-js';
import React, { createContext, useContext, useEffect, useState, ReactNode, useRef } from 'react';

import { supabase } from '@/lib/supabase/client';
import type { Tables } from '@/types';

// Define the shape of the user context
interface UserContextType {
  user: User | null;
  session: Session | null;
  role: string | null;
  isLoading: boolean;
  error: string | null;
}

// Create the context with an undefined default value
const UserContext = createContext<UserContextType | undefined>(undefined);

/**
 * Provides user and session state to its children.
 * It handles fetching the user's session and role, and listens for auth state changes.
 */
export const UserProvider = ({ children }: { children: ReactNode }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const authListenerRef = useRef<Subscription | null>(null);

  useEffect(() => {
    let isMounted = true;

    const initializeSession = async () => {
      try {
        const { data: { session: currentSession }, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) throw sessionError;

        if (isMounted) {
          setSession(currentSession);
          const currentUser = currentSession?.user ?? null;
          setUser(currentUser);

          if (currentUser) {
            // If a user exists, fetch their profile and role
            const { data: profile, error: profileError } = await supabase
              .from('profiles')
              .select('role')
              .eq('id', currentUser.id)
              .single();

            if (profileError) {
              console.error("Error fetching user profile:", profileError.message);
              setRole(null);
            } else {
              setRole(profile?.role || null);
            }
          }
        }
      } catch (err) {
        if (err instanceof Error) {
          console.error("Initialization Error:", err.message);
          setError(err.message);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    void initializeSession();

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, newSession) => {
        if (isMounted) {
          setSession(newSession);
          const newUser = newSession?.user ?? null;
          setUser(newUser);
          
          if (newUser) {
            // User logged in, fetch their profile
            const { data: profile, error: profileError } = await supabase
              .from('profiles')
              .select('role')
              .eq('id', newUser.id)
              .single();
            
            if (profileError) {
              console.error("Error fetching profile on auth change:", profileError.message);
              setRole(null);
            } else {
              setRole(profile?.role || null);
            }
          } else {
            // User logged out
            setRole(null);
          }
          setIsLoading(false);
        }
      }
    );

    authListenerRef.current = subscription;

    return () => {
      isMounted = false;
      authListenerRef.current?.unsubscribe();
    };
  }, []);

  const value = {
    session,
    user,
    role,
    isLoading,
    error,
  };

  // Render a loading state until the initial session check is complete
  if (isLoading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-base-100">
        <span className="loading loading-spinner loading-lg text-primary"></span>
        <p className="mt-4 text-lg">Loading Application...</p>
      </div>
    );
  }
  
  return (
    <UserContext.Provider value={value}>
      {children}
    </UserContext.Provider>
  );
};

/**
 * Custom hook to access the UserContext.
 */
export const useUser = (): UserContextType => {
  const context = useContext(UserContext);
  if (context === undefined) {
    throw new Error('useUser must be used within a UserProvider');
  }
  return context;
};