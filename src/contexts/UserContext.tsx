"use client";

import { Session, Subscription, User } from '@supabase/supabase-js';
import React, { createContext, useContext, useEffect, useState, ReactNode, useRef } from 'react';
import { useRouter } from 'next/navigation';

import { supabase } from '@/lib/supabase/client';

interface UserContextType {
  user: User | null;
  session: Session | null;
  role: string | null;
  isLoading: boolean;
  error: string | null;
  fullName: string | null;
  avatarUrl: string | null;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

export const UserProvider = ({ children }: { children: ReactNode }) => {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const authListenerRef = useRef<Subscription | null>(null);

  const [fullName, setFullName] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    const initializeSession = async () => {
      console.log("UserContext: Initializing session...");
      try {
        const { data: { session: currentSession }, error: sessionError } = await supabase.auth.getSession();
        console.log("UserContext: After supabase.auth.getSession(), Current session:", currentSession);
        console.log("UserContext: Session error:", sessionError);

        if (sessionError) throw sessionError;

        if (isMounted) {
          setSession(currentSession);
          const currentUser = currentSession?.user ?? null;
          setUser(currentUser);

          if (currentUser) {
            // FIX: Read 'user_role' from 'user_metadata'
            const userRoleFromMetadata = (currentUser.user_metadata?.user_role as string) || null;
            setRole(userRoleFromMetadata);
            console.log("UserContext: Initial session - Role determined:", userRoleFromMetadata); // NEW LOG

            const userFullName = currentUser.user_metadata?.full_name || currentUser.user_metadata?.name || currentUser.email?.split('@')[0] || null;
            const userAvatarUrl = currentUser.user_metadata?.avatar_url || currentUser.user_metadata?.picture || null;

            setFullName(userFullName as string);
            setAvatarUrl(userAvatarUrl as string);
          } else {
            console.log("UserContext: Initial session - No user found.");
            setRole(null); // Ensure role is cleared if no user
          }
        }
      } catch (err) {
        if (err instanceof Error) {
          console.error("UserContext: Initialization Error:", err.message);
          setError(err.message);
        }
      } finally {
        if (isMounted) {
          console.log("UserContext: Finished initializeSession.");
          setIsLoading(false);
        }
      }
    };

    void initializeSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, newSession) => {
        console.log("UserContext: onAuthStateChange event:", _event);
        console.log("UserContext: onAuthStateChange newSession:", newSession);
        if (isMounted) {
          setSession(newSession);
          const newUser = newSession?.user ?? null;
          setUser(newUser);

          if (newUser) {
            // FIX: Read 'user_role' from 'user_metadata'
            const userRoleFromMetadata = (newUser.user_metadata?.user_role as string) || null;
            setRole(userRoleFromMetadata);
            console.log("UserContext: Auth state change - Role determined:", userRoleFromMetadata); // NEW LOG

            const userFullName = newUser.user_metadata?.full_name || newUser.user_metadata?.name || newUser.email?.split('@')[0] || null;
            const userAvatarUrl = newUser.user_metadata?.avatar_url || newUser.user_metadata?.picture || null;

            setFullName(userFullName as string);
            setAvatarUrl(userAvatarUrl as string);

          } else {
            console.log("UserContext: Auth state change - User logged out.");
            setRole(null);
            setFullName(null);
            setAvatarUrl(null);
          }
          console.log("UserContext: Finished onAuthStateChange.");
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

  useEffect(() => {
    // This effect handles redirects after loading is complete
    if (!isLoading) {
      if (session) {
        // Ensure user is on dashboard if logged in
        if (router.pathname !== '/dashboard') {
            router.push('/dashboard');
        }
      } else {
        // Ensure user is on login (root) if not logged in
        if (router.pathname !== '/') { // FIX: Changed from '/login' to '/'
            router.push('/');
        }
      }
    }
  }, [session, isLoading, router.pathname, router]);

  const safeAvatarUrl = avatarUrl || '/default-avatar.png';

  const value = {
    session,
    user,
    role,
    isLoading,
    error,
    fullName,
    avatarUrl: safeAvatarUrl,
  };

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

export const useUser = (): UserContextType => {
  const context = useContext(UserContext);
  if (context === undefined) {
    throw new Error('useUser must be used within a UserProvider');
  }
  return context;
};