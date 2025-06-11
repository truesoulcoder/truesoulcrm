// src/components/EdgeFunctionTriggerProvider.tsx
'use client';
import { useEffect } from 'react';
import { supabase } from '@/lib/supabase/client';
import { Session } from '@supabase/supabase-js';

export default function EdgeFunctionTriggerProvider() {
  useEffect(() => {
    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      if ((event === 'SIGNED_IN' || event === 'INITIAL_SESSION') && session) {
        // Do not await here. Let the function run in the background.
        triggerSetTrueSoulRole(session);
      }
    });
    return () => {
      authListener?.subscription?.unsubscribe();
    };
  }, []);
  return null;
}

async function triggerSetTrueSoulRole(session: Session) {
  const user = session?.user;
  if (!user) return;

  if (user.user_metadata?.user_role) {
    return;
  }
  
  const payload = {
    user_id: user.id,
    user_email: user.email,
    full_name: user.user_metadata?.full_name,
    avatar_url: user.user_metadata?.avatar_url,
  };

  try {
    console.log('Invoking set-user-role function...');
    const { error } = await supabase.functions.invoke('set-user-role', {
      body: payload,
    });

    if (error) throw error;

    console.log('Role function successful. Refreshing session...');
    const { error: refreshError } = await supabase.auth.refreshSession();
    if (refreshError) throw refreshError;

  } catch (err) {
    console.error('Failed to trigger or process Edge Function `set-user-role`:', err);
  }
}