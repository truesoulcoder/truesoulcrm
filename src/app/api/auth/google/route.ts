import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  console.log('[API /auth/google] Initiating Google OAuth flow.');
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) {
    return NextResponse.json({ error: 'Supabase URL not set' }, { status: 500 });
  }

  // Determine the base URL for redirects
  const appBaseUrl = req.nextUrl.origin || process.env.NEXT_PUBLIC_SITE_URL || 
    (process.env.NODE_ENV === 'development' ? 'http://localhost:3000' : null);
    
  if (!appBaseUrl) {
    return NextResponse.json(
      { error: 'App base URL configuration error for OAuth callback' }, 
      { status: 500 }
    );
  }

  // Path in your app that handles the OAuth hash
  const appFinalRedirectUri = new URL('/', appBaseUrl).href;
  
  // Scopes for Google OAuth
  const scopes = [
    'openid',
    'https://www.googleapis.com/auth/userinfo.email',
    'https://www.googleapis.com/auth/userinfo.profile'
  ];

  const params = new URLSearchParams({
    provider: 'google',
    redirect_to: appFinalRedirectUri,
    scopes: scopes.join(' ')
  });

  return NextResponse.redirect(
    `${supabaseUrl}/auth/v1/authorize?${params.toString()}`
  );
  
}

