// src/components/EdgeFunctionTriggerProvider.tsx
'use client';
import { useEffect } from 'react';
import { supabase } from '@/lib/supabase/client';

export default function EdgeFunctionTriggerProvider() {
  useEffect(() => {
    const { data: authListener } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' && session) {
        await triggerSetTrueSoulRole(session);
      }
    });
    return () => {
      authListener?.subscription?.unsubscribe();
    };
  }, []);
  return null;
}

async function triggerSetTrueSoulRole(session: any) {
  const user = session?.user;
  if (!user) return;

  const payload = {
    user_id: user.id,
    user_email: user.email,
    user_role: user.user_metadata?.user_role || null,
    full_name: user.user_metadata?.full_name || null,
    avatar_url: user.user_metadata?.avatar_url || null,
  };

  try {
    const res = await fetch('https://lefvtgqockzqkasylzwb.supabase.co/functions/v1/set-user-role', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`
      },
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Edge Function error: ${res.status} ${text}`);
    }
  } catch (err) {
    console.error('Failed to trigger Edge Function:', err);
  }
}