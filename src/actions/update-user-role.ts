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

    // Attempt update via Auth API first
    try {
      const { error: updateAuthError } = await supabaseAdmin.auth.admin.updateUserById(user_id, {
        user_metadata: {
          ...(user.user_metadata || {}),
          user_role: newRole,
          full_name: full_name || user.user_metadata?.full_name || null,
          avatar_url: avatar_url || user.user_metadata?.avatar_url || null
        }
      });

      if (!updateAuthError) return { success: true };
    } catch (authError) {
      console.error('Auth API update failed, attempting direct SQL fallback', authError);
    }

    // Fallback to direct SQL update
    const { error: sqlError } = await supabaseAdmin
      .from('users')
      .update({ 
        raw_user_meta_data: {
          ...(user.user_metadata || {}),
          user_role: newRole,
          full_name: full_name || user.user_metadata?.full_name || null,
          avatar_url: avatar_url || user.user_metadata?.avatar_url || null
        }
      })
      .eq('id', user_id);

    if (sqlError) {
      throw new Error(`Both Auth API and SQL update failed: ${sqlError.message}`);
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