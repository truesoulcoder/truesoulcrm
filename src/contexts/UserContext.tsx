// src/contexts/UserContext.tsx
"use client"; // Add this directive at the very top

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
            setRole(userRoleFromMetadata); // Set role here

            console.log("Before attempting to fetch profile (for other data), user ID:", currentUser.id);
            // Fetch profile for other data like full_name or avatar_url, but do not rely on it for role
            // Use .maybeSingle() to gracefully handle cases where a profile might not exist (though ideally it should)
            const { data: profile, error: profileError } = await supabase
              .from('profiles')
              .select('full_name, avatar_url') // Select only non-role fields from profile
              .eq('id', currentUser.id)
              .maybeSingle(); // Use maybeSingle to avoid error if no profile is found

            if (profileError) {
              console.error("Error fetching user profile (non-critical if only profile data is missing):", profileError.message);
              // Role is already set from app_metadata, so no need to change it here.
              // Handle other profile data if needed, e.g., set default full_name if profile is missing.
            } else if (profile) {
              // You might want to do something with profile data here, e.g., combine with user object
            }
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
            setRole(userRoleFromMetadata); // Set role here

            console.log("New user ID in onAuthStateChange:", newUser.id);
            // Fetch profile for other data like full_name or avatar_url
            console.log("Before calling supabase.from('profiles').select('full_name, avatar_url').eq('id', newUser.id).maybeSingle() in onAuthStateChange");
            const { data: profile, error: profileError } = await supabase
              .from('profiles')
              .select('full_name, avatar_url') // Select non-role fields
              .eq('id', newUser.id)
              .maybeSingle(); // Use maybeSingle to avoid error if no profile is found

            console.log("After calling supabase.from('profiles').select('full_name, avatar_url').eq('id', newUser.id).maybeSingle() in onAuthStateChange");
            console.log("Profile in onAuthStateChange:", profile);
            console.log("Profile error in onAuthStateChange:", profileError);

            if (profileError) {
              console.error("Error fetching profile on auth change (non-critical):", profileError.message);
              // Role is already set from app_metadata.
            } else if (profile) {
              // Handle other profile data
            }
          } else {
            // User logged out
            console.log("User logged out");
            setRole(null);
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