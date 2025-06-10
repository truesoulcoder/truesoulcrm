// In EdgeFunctionTriggerProvider.tsx
'use client'
import { useEffect } from 'react'
import { supabase } from '@/lib/supabase/client'
import { updateUserRole } from '@/actions/update-user-role'

export default function EdgeFunctionTriggerProvider() {
  useEffect(() => {
    const { data: authListener } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (event === 'SIGNED_IN' && session?.user) {
          try {
            await updateUserRole({
              user_id: session.user.id,
              user_email: session.user.email!,
              user_role: session.user.user_metadata?.user_role,
              full_name: session.user.user_metadata?.full_name,
              avatar_url: session.user.user_metadata?.avatar_url
            })
          } catch (error) {
            console.error('Failed to update user role:', error)
          }
        }
      }
    )

    return () => authListener?.subscription.unsubscribe()
  }, [])

  return null
}