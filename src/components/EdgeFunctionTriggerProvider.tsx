// src/components/EdgeFunctionTriggerProvider.tsx
'use client';
import { useEffect } from 'react';
import { supabase } from '@/lib/supabase/client';
import { Session } from '@supabase/supabase-js';

export default function EdgeFunctionTriggerProvider() {
  useEffect(() => {
    const { data: authListener } = supabase.auth.onAuthStateChange(async (event, session) => {
      // Trigger on initial session load or after a new sign-in
      if ((event === 'SIGNED_IN' || event === 'INITIAL_SESSION') && session) {
        await triggerSetTrueSoulRole(session);
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

  // Optimization: If the user's token already has the role, don't call the function again.
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
    console.log('Invoking set-user-role function to establish user role...');
    const { error } = await supabase.functions.invoke('set-user-role', {
      body: payload,
    });

    if (error) {
      throw error;
    }

    console.log('Edge Function `set-user-role` successful. Refreshing session...');

    // *** THE CRITICAL FIX IS HERE ***
    // After the function updates the role in the database, we MUST refresh the
    // client-side session to get a new token with the updated metadata.
    const { error: refreshError } = await supabase.auth.refreshSession();

    if (refreshError) {
      console.error('Failed to refresh session after role update:', refreshError);
    }
    // The `onAuthStateChange` listener in `UserContext` will now fire again
    // with the updated session, which will unlock the UI.

  } catch (err) {
    console.error('Failed to trigger or process Edge Function `set-user-role`:', err);
  }
}