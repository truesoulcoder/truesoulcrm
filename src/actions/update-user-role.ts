// src/actions/update-user-role.ts
'use server'

import { createAdminServerClient } from '@/lib/supabase/server'

export async function updateUserRole(userData: {
  user_id: string
  user_email: string
  user_role?: string
  full_name?: string | null
  avatar_url?: string | null
}) {
  // Create admin client with service role key
  const supabaseAdmin = await createAdminServerClient()

  const { user_id, user_email, user_role, full_name, avatar_url } = userData

  // Determine user role
  let newRole = user_role
  if (user_email === 'SET_USER_ROLE_FUNCTION_SUPER_ADMIN_EMAIL') {
    newRole = 'superadmin'
  } else if (!newRole) {
    newRole = 'guest'
  }

  try {
    // Update user metadata
    const { error: updateAuthError } = await supabaseAdmin.auth.admin.updateUserById(user_id, {
      user_metadata: {
        user_role: newRole,
        full_name: full_name || null,
        avatar_url: avatar_url || null
      }
    })

    if (updateAuthError) {
      throw new Error(`Auth update failed: ${updateAuthError.message}`)
    }

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

    if (profileError) {
      throw new Error(`Profile upsert failed: ${profileError.message}`)
    }

    return { success: true }
  } catch (error) {
    console.error('Error in updateUserRole:', error)
    throw error
  }
}