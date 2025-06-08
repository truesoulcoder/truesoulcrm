import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  try {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${requestUrl.origin}/auth/callback`,
        scopes: 'openid email profile',
        queryParams: {
          access_type: 'offline',
          prompt: 'consent',
        },
        protocol: 'oauth2',
        version: 'v2'
      },
    });

    if (error) throw error;
    return NextResponse.redirect(data.url);
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to initiate Google OAuth: ' + error.message },
      { status: 500 }
    );
  }
}
