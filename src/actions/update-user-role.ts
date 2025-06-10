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
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY')
  }

  const supabaseAdmin = await createAdminServerClient()

  const { user_id, user_email, user_role, full_name, avatar_url } = userData

  // Determine user role
  let newRole = user_role
  if (user_email === process.env.SET_USER_ROLE_FUNCTION_SUPER_ADMIN_EMAIL) {
    newRole = 'superadmin'
  } else if (!newRole) {
    newRole = 'guest'
  }

  try {
    console.log('Attempting to update user with:', {
      user_id,
      newRole,
      hasServiceRoleKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
      supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL
    })

    // Validate environment variables
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY || typeof process.env.SUPABASE_SERVICE_ROLE_KEY !== 'string') {
      throw new Error('Invalid SUPABASE_SERVICE_ROLE_KEY configuration')
    }

    // First verify the user exists
    const { data: userResponse, error: fetchError } = await supabaseAdmin.auth.admin.getUserById(user_id)
    if (fetchError || !userResponse?.user) {
      throw new Error(`User not found: ${fetchError?.message || 'No user data returned'}`)
    }
    const user = userResponse.user

    // Attempt update with retry
    let retries = 3
    let lastError: Error | null = null
    
    while (retries > 0) {
      try {
        const { error: updateAuthError } = await supabaseAdmin.auth.admin.updateUserById(user_id, {
          user_metadata: {
            ...(user.user_metadata || {}), // Preserve existing metadata
            user_role: newRole,
            full_name: full_name || user.user_metadata?.full_name || null,
            avatar_url: avatar_url || user.user_metadata?.avatar_url || null
          }
        })

        if (!updateAuthError) {
          break // Success
        }
        
        lastError = new Error(`Auth update failed: ${updateAuthError.message}`)
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error))
      }
      
      retries--
      if (retries > 0) {
        await new Promise(resolve => setTimeout(resolve, 1000)) // Wait 1s before retry
      }
    }

    if (lastError) {
      throw lastError
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