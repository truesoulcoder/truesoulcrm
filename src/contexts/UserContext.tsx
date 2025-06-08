// src/contexts/UserContext.tsx
"use client"; // Add this directive at the very top

import { Session, Subscription, User } from '@supabase/supabase-js';
import React, { createContext, useContext, useEffect, useState, ReactNode, useRef } from 'react';

import { supabase } from '@/lib/supabase/client';
import type { Tables } from '@/types'; // This might still be needed for other types, but not for profiles anymore

// Define the shape of the user context
interface UserContextType {
  user: User | null;
  session: Session | null;
  role: string | null;
  isLoading: boolean;
  error: string | null;
  // Expose full name and avatar URL directly from user_metadata
  fullName: string | null;
  avatarUrl: string | null;
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

  // New state for full name and avatar URL
  const [fullName, setFullName] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);


  useEffect(() => {
    let isMounted = true;

    const initializeSession = async () => {
      console.log("Initializing session...");
      try {
        console.log("Before calling supabase.auth.getSession()");
        const { data: { session: currentSession }, error: sessionError } = await supabase.auth.getSession();
        console.log("After calling supabase.auth.getSession()");
        console.log("Current session:", currentSession);
        console.log("Session error:", sessionError);
        if (sessionError) throw sessionError;

        if (isMounted) {
          setSession(currentSession);
          const currentUser = currentSession?.user ?? null;
          setUser(currentUser);

          if (currentUser) {
            // Directly use the role from app_metadata set by the Edge Function
            const userRoleFromMetadata = (currentUser.app_metadata?.role as string) || null;
            setRole(userRoleFromMetadata);

            // Get full_name and avatar_url directly from user_metadata
            const userFullName = currentUser.user_metadata?.full_name || currentUser.user_metadata?.name || currentUser.email?.split('@')[0] || null;
            const userAvatarUrl = currentUser.user_metadata?.avatar_url || currentUser.user_metadata?.picture || null;

            setFullName(userFullName as string);
            setAvatarUrl(userAvatarUrl as string);

            // Removed: supabase.from('profiles') query as the table no longer exists.
            // All necessary data (role, full_name, avatar_url) is now fetched from auth.users directly.

          }
        }
      } catch (err) {
        if (err instanceof Error) {
          console.error("Initialization Error:", err.message);
          console.log("Error in initializeSession catch block:", err.message);
          setError(err.message);
        }
      } finally {
        if (isMounted) {
          console.log("Before setIsLoading(false) in initializeSession finally block");
          setIsLoading(false);
        }
      }
    };

    void initializeSession();

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, newSession) => {
        console.log("onAuthStateChange event:", _event);
        console.log("onAuthStateChange newSession:", newSession);
        if (isMounted) {
          setSession(newSession);
          const newUser = newSession?.user ?? null;
          setUser(newUser);

          if (newUser) {
            // Directly use the role from app_metadata set by the Edge Function
            const userRoleFromMetadata = (newUser.app_metadata?.role as string) || null;
            setRole(userRoleFromMetadata);

            // Get full_name and avatar_url directly from user_metadata
            const userFullName = newUser.user_metadata?.full_name || newUser.user_metadata?.name || newUser.email?.split('@')[0] || null;
            const userAvatarUrl = newUser.user_metadata?.avatar_url || newUser.user_metadata?.picture || null;

            setFullName(userFullName as string);
            setAvatarUrl(userAvatarUrl as string);

            // Removed: supabase.from('profiles') query as the table no longer exists.
            // All necessary data (role, full_name, avatar_url) is now fetched from auth.users directly.

          } else {
            // User logged out
            console.log("User logged out");
            setRole(null);
            setFullName(null);
            setAvatarUrl(null);
          }
          console.log("Before setIsLoading(false) in onAuthStateChange");
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
    fullName, // Expose new state
    avatarUrl, // Expose new state
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