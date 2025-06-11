"use client";

import { Session, User } from '@supabase/supabase-js';
import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
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
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const [fullName, setFullName] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

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
            const userRoleFromMetadata = (currentUser.user_metadata?.user_role as string) || null;
            setRole(userRoleFromMetadata);

            const userFullName = currentUser.user_metadata?.full_name || currentUser.user_metadata?.name || currentUser.email?.split('@')[0] || null;
            const userAvatarUrl = currentUser.user_metadata?.avatar_url || currentUser.user_metadata?.picture || null;

            setFullName(userFullName as string);
            setAvatarUrl(userAvatarUrl as string);
          } else {
            setRole(null);
          }
        }
      } catch (err) {
        if (err instanceof Error) {
          console.error("UserContext: Initialization Error:", err.message);
          setError(err.message);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    void initializeSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, newSession) => {
        if (isMounted) {
          setSession(newSession);
          const newUser = newSession?.user ?? null;
          setUser(newUser);

          if (newUser) {
            const userRoleFromMetadata = (newUser.user_metadata?.user_role as string) || null;
            setRole(userRoleFromMetadata);

            const userFullName = newUser.user_metadata?.full_name || newUser.user_metadata?.name || newUser.email?.split('@')[0] || null;
            const userAvatarUrl = newUser.user_metadata?.avatar_url || newUser.user_metadata?.picture || null;

            setFullName(userFullName as string);
            setAvatarUrl(userAvatarUrl as string);
          } else {
            setRole(null);
            setFullName(null);
            setAvatarUrl(null);
          }
          setIsLoading(false);
        }
      }
    );

    return () => {
      isMounted = false;
      subscription?.unsubscribe();
    };
  }, []);

  const value = {
    session,
    user,
    role,
    isLoading,
    error,
    fullName,
    avatarUrl,
  };

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