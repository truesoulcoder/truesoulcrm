'use server';

import { createClient } from '@/lib/supabase/server';
import { cookies } from 'next/headers';

export async function updateUserProfile() {
  try {
    const cookieStore = cookies();
    const supabase = createClient(cookieStore);

    // Get the current user
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      console.error('Error getting user:', userError?.message || 'No user found');
      return { error: 'Not authenticated' };
    }

    // Check if we already have the avatar URL in user_metadata
    if (user.user_metadata?.avatar_url) {
      return { success: true };
    }

    // Try to get the avatar URL from the identity data
    const avatarUrl = user.identities?.[0]?.identity_data?.avatar_url ||
                     user.identities?.[0]?.identity_data?.picture;

    if (!avatarUrl) {
      return { error: 'No avatar URL found in identity data' };
    }

    // Prepare the metadata to update
    const updatedMetadata = {
      ...user.user_metadata,
      avatar_url: avatarUrl,
      full_name: user.user_metadata?.full_name ||
                user.identities?.[0]?.identity_data?.full_name ||
                user.user_metadata?.name ||
                user.email?.split('@')[0] ||
                'User'
    };

    // Update the user's metadata with the avatar URL
    const { error: updateError } = await supabase.auth.updateUser({
      data: updatedMetadata
    });

    if (updateError) {
      console.error('Error updating user profile:', updateError.message);
      return { error: updateError.message };
    }

    return { success: true };
  } catch (error) {
    console.error('Unexpected error in updateUserProfile:', error);
    return {
      error: error instanceof Error ? error.message : 'An unexpected error occurred'
    };
  }
}