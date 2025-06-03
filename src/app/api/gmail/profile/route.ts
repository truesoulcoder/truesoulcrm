// src/app/api/gmail/profile/route.ts
import { NextRequest, NextResponse } from 'next/server';

import { createClient } from '@/lib/supabase/server';

// Helper function to get user role
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

    // Get the user's profile data
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('full_name, avatar_url')
      .eq('id', user.id)
      .single();

    // If we have a Google OAuth user but no picture, try to get it from Google
    if (user.app_metadata?.provider === 'google' && !profile?.avatar_url) {
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
            
            // Update the profile with the Google picture
            await supabase
              .from('profiles')
              .update({ 
                avatar_url: googleUser.picture,
                full_name: googleUser.name || profile?.full_name
              })
              .eq('id', user.id);
            
            // Return the updated profile
            return NextResponse.json({
              name: googleUser.name || profile?.full_name || user.email,
              picture: googleUser.picture,
              isSuperAdmin
            });
          }
        }
      } catch (error) {
        console.error('Error fetching Google profile:', error);
        // Continue to return the existing profile if there's an error
      }
    }

    if (profileError) {
      console.error('Error fetching profile:', profileError);
      // Fall back to user_metadata if profile fetch fails
      const { full_name, avatar_url } = user.user_metadata || {};
      return NextResponse.json({
        name: full_name || user.email,
        picture: avatar_url || null,
        isSuperAdmin
      });
    }

    return NextResponse.json({
      name: profile?.full_name || user.email,
      picture: profile?.avatar_url || null,
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