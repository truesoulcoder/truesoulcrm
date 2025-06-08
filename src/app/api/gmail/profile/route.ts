// src/app/api/gmail/profile/route.ts
import { NextRequest, NextResponse } from 'next/server';

import { createClient } from '@/lib/supabase/server';

// Helper function to get user role (this is already good as it checks app_metadata)
function getUserRole(user: any): string {
  // First check raw_app_meta_data.role
  if (user?.raw_app_meta_data?.role) {
    return user.raw_app_meta_data.role;
  }
  // Then check app_metadata.role (common in newer Supabase versions)
  if (user?.app_metadata?.role) {
    return user.app_metadata.role;
  }
  // Default to 'authenticated'
  return 'authenticated';
}

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({
        name: null,
        picture: null,
        isSuperAdmin: false
      }, { status: 401 });
    }

    // Get user's role
    const userRole = getUserRole(user);
    const isSuperAdmin = userRole === 'superadmin';

    // Directly use user's metadata from auth.users, as profiles table is gone.
    let currentFullName = user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split('@')[0] || user.email;
    let currentAvatarUrl = user.user_metadata?.avatar_url || user.user_metadata?.picture || null;

    // If we have a Google OAuth user but no picture, try to get it from Google
    // We'll update user_metadata directly instead of profiles table.
    if (user.app_metadata?.provider === 'google' && !currentAvatarUrl) {
      try {
        // Get the access token from the session
        const { data: { session } } = await supabase.auth.getSession();
        const accessToken = session?.provider_token;

        if (accessToken) {
          // Fetch user info from Google
          const response = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
            headers: {
              Authorization: `Bearer ${accessToken}`
            }
          });

          if (response.ok) {
            const googleUser = await response.json();
            const newAvatarUrl = googleUser.picture;
            const newFullName = googleUser.name;

            // Prepare updated user_metadata
            const updatedMetadata = {
              ...user.user_metadata,
              avatar_url: newAvatarUrl,
              full_name: newFullName || currentFullName // Prioritize new Google name, fallback to existing or derived
            };

            // Update the user's metadata directly in auth.users
            const { error: updateError } = await supabase.auth.updateUser({
              data: updatedMetadata
            });

            if (updateError) {
              console.error('Error updating user metadata via API:', updateError.message);
              // Continue with current values if update fails
            } else {
              // Update local variables with new data
              currentFullName = updatedMetadata.full_name;
              currentAvatarUrl = updatedMetadata.avatar_url;
            }
          }
        }
      } catch (error) {
        console.error('Error fetching Google profile for update:', error);
        // Continue to return the existing (or derived) profile if there's an error
      }
    }

    // Return the consolidated data
    return NextResponse.json({
      name: currentFullName,
      picture: currentAvatarUrl,
      isSuperAdmin
    });
  } catch (error) {
    console.error('Error in profile API:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch profile',
        isSuperAdmin: false
      },
      { status: 500 }
    );
  }
}