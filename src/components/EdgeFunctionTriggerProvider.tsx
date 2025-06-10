'use client';
import { useEffect } from 'react';
import { supabase } from '@/lib/supabase/client';
import { Session } from '@supabase/supabase-js';

export default function EdgeFunctionTriggerProvider() {
  useEffect(() => {
    const { data: authListener } = supabase.auth.onAuthStateChange(async (event, session) => {
      // Also trigger on INITIAL_SESSION to handle existing sessions on page load
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

  // The payload seems to just need user id and email for the function to work
  const payload = {
    user_id: user.id,
    user_email: user.email,
  };

  try {
    console.log('Invoking set-user-role function...');
    // Use the Supabase JS client's `invoke` method.
    // This handles the URL, auth headers, and CORS correctly.
    const { data, error } = await supabase.functions.invoke('set-user-role', {
      body: payload,
    });

    if (error) {
      throw error; // Throw the error to be caught by the catch block
    }

    console.log('Edge Function `set-user-role` invoked successfully.', data);

  } catch (err) {
    // The caught error will have more details than the generic 'Failed to fetch'
    console.error('Failed to trigger Edge Function `set-user-role`:', err);
  }
}