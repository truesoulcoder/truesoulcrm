import { createClient } from '@supabase/supabase-js';
import { NextResponse, type NextRequest } from 'next/server';

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const next = requestUrl.searchParams.get('next') || '/';
  const error = requestUrl.searchParams.get('error');
  const error_description = requestUrl.searchParams.get('error_description');

  if (error) {
    console.error('[Auth Callback] Error during authorization:', error, error_description);
    return NextResponse.redirect(
      `${requestUrl.origin}/auth/auth-code-error?error=${encodeURIComponent(error_description || 'Authorization failed')}`
    );
  }

  if (code) {
    console.log('[Auth Callback] Exchanging code for session');
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    try {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) {
        console.error('[Auth Callback] Error exchanging code for session:', error);
        return NextResponse.redirect(
          `${requestUrl.origin}/auth/auth-code-error?error=${encodeURIComponent(error.message)}`
        );
      }
    } catch (error) {
      console.error('[Auth Callback] Exception during code exchange:', error);
      return NextResponse.redirect(
        `${requestUrl.origin}/auth/auth-code-error?error=${encodeURIComponent('Failed to exchange code for session')}`
      );
    }
  }

  // URL to redirect to after sign in process completes
  return NextResponse.redirect(`${requestUrl.origin}${next}`);
}
