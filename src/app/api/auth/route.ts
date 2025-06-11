import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const next = searchParams.get('next') || '/';
  
  console.log('[API /auth/google] Initiating Google OAuth flow');
  
  const requestUrl = new URL(request.url);
  const baseUrl = requestUrl.origin;
  const redirectTo = `${baseUrl}/auth/callback?next=${encodeURIComponent(next)}`;
  
  const cookieStore = cookies();
  
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: any) {
          cookieStore.set({ name, value, ...options });
        },
        remove(name: string, options: any) {
          cookieStore.delete({ name, ...options });
        },
      },
    }
  );

  try {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo,
        queryParams: {
          access_type: 'offline',
          prompt: 'consent',
          hd: '*',  // Allow any Google domain
        },
        scopes: [
          'openid',
          'email',
          'profile',
          'https://www.googleapis.com/auth/gmail.readonly',
          'https://www.googleapis.com/auth/gmail.send',
          'https://www.googleapis.com/auth/gmail.compose',
          'https://www.googleapis.com/auth/gmail.modify',
        ].join(' '),
      },
    });

    if (error) {
      console.error('[API /auth/google] OAuth error:', error);
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    if (data?.url) {
      console.log('[API /auth/google] Redirecting to:', data.url);
      return NextResponse.redirect(data.url);
    }

    throw new Error('No URL returned from OAuth provider');
  } catch (error) {
    console.error('[API /auth/google] Error:', error);
    return NextResponse.json(
      { error: 'Failed to initiate Google OAuth' },
      { status: 500 }
    );
  }
}