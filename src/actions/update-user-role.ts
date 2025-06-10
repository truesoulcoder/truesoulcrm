// src/actions/update-user-role.ts
'use server'

import { createClient } from '@/lib/supabase/server'
import { cookies } from 'next/headers'

export async function updateUserRole(userData: {
  user_id: string
  user_email: string
  user_role?: string
  full_name?: string | null
  avatar_url?: string | null
}) {
  const cookieStore = cookies()
  const supabase = createClient(cookieStore)
  
  const { data: { session } } = await supabase.auth.getSession()
  
  if (!session) {
    throw new Error('Not authenticated')
  }

  // Initialize Supabase admin client
  const supabaseAdmin = createClient(cookieStore, {
    isAdmin: true
  })

  const { user_id, user_email, user_role, full_name, avatar_url } = userData

  // Determine user role
  let newRole = user_role
  if (user_email === 'chrisphillips@truesoulpartners.com') {
    newRole = 'superadmin'
  } else if (!newRole) {
    newRole = 'guest'
  }

  // Update user metadata
  const { error: updateAuthError } = await supabaseAdmin.auth.admin.updateUserById(user_id, {
    user_metadata: {
      user_role: newRole,
      full_name: full_name || null,
      avatar_url: avatar_url || null
    }
  })

  if (updateAuthError) throw new Error(`Auth update failed: ${updateAuthError.message}`)

  // Upsert profile
  const { error: profileError } = await supabaseAdmin
    .from('profiles')
    .upsert({
      id: user_id,
      email: user_email,
      user_role: newRole,
      full_name: full_name || null,
      avatar_url: avatar_url || null,
      updated_at: new Date().toISOString()
    })

  if (profileError) throw new Error(`Profile upsert failed: ${profileError.message}`)

  return { success: true }
}