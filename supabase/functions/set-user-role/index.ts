import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.42.0';

console.log('Function `set-user-role` up and running!');

// Define allowed origins
const allowedOrigins = [
  'http://localhost:3000',
  'https://truesoulpartners.vercel.app',
  'https://truesoulpartners.vercel.app/'
];

// Interface for the request body
interface UserData {
  user_email: string;
  user_id: string;
  user_role?: string;
  full_name?: string | null;
  avatar_url?: string | null;
}

// Helper function to get CORS headers
function getCorsHeaders(origin: string | null): Record<string, string> {
  // For development, allow the request origin or default to first allowed origin
  const allowedOrigin = origin && allowedOrigins.some(allowed => 
    origin.replace(/\/$/, '') === allowed.replace(/\/$/, '')
  ) ? origin : allowedOrigins[0];

  return {
    'Access-Control-Allow-Origin': allowedOrigin,  // Must be a specific origin, not '*'
    'Access-Control-Allow-Methods': 'POST, OPTIONS, GET, PUT, DELETE',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Content-Type': 'application/json',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Max-Age': '86400' // 24 hours
  };
}

// Initialize Supabase clients with proper typing
function createSupabaseClient(token?: string): SupabaseClient {
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const supabaseKey = token 
    ? token 
    : Deno.env.get('SUPABASE_ANON_KEY') ?? '';

  return createClient(supabaseUrl, supabaseKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      ...(token ? {} : { detectSessionInUrl: false })
    }
  });
}

serve(async (req: Request) => {
  const origin = req.headers.get('origin') || '';
  const corsHeaders = getCorsHeaders(origin);

// Handle CORS preflight
if (req.method === 'OPTIONS') {
  const corsHeaders = {
    ...getCorsHeaders(origin),
    // Ensure these headers are explicitly set for preflight
    'Access-Control-Allow-Methods': 'POST, OPTIONS, GET, PUT, DELETE',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Max-Age': '86400',
    'Access-Control-Allow-Credentials': 'true'
  };
  
  return new Response(null, { 
    status: 204,
    headers: corsHeaders
  });
}

  // Only allow POST requests
  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: corsHeaders }
    );
  }

  // Get the JWT from the Authorization header
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return new Response(
      JSON.stringify({ error: 'No authorization header' }),
      { status: 401, headers: corsHeaders }
    );
  }

  // Extract token
  const token = authHeader.replace('Bearer ', '');
  const supabaseClient = createSupabaseClient(token);

  try {
    // Verify the token is valid
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid or expired token' }),
        { status: 401, headers: corsHeaders }
      );
    }

    // Parse request body
    let requestData: UserData;
    try {
      requestData = await req.json();
    } catch (e) {
      return new Response(
        JSON.stringify({ error: 'Invalid JSON body' }),
        { status: 400, headers: corsHeaders }
      );
    }

    const { user_email, user_id, user_role, full_name, avatar_url } = requestData;

    // Validate required fields
    if (!user_email || !user_id) {
      return new Response(
        JSON.stringify({ error: 'Missing user_email or user_id in request' }),
        { status: 400, headers: corsHeaders }
      );
    }

    // Initialize Supabase admin client
    const supabaseAdmin = createSupabaseClient(Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'));

    // Determine user role
    let newRole = user_role;
    if (user_email === 'chrisphillips@truesoulpartners.com') {
      newRole = 'superadmin';
    } else if (!newRole) {
      newRole = 'guest';
    }

    // Update user metadata in auth.users
    const { error: updateAuthError } = await supabaseAdmin.auth.admin.updateUserById(user_id, {
      user_metadata: {
        user_role: newRole,
        full_name: full_name || null,
        avatar_url: avatar_url || null
      }
    });

    if (updateAuthError) {
      console.error('Error updating auth.users metadata:', updateAuthError.message);
      return new Response(
        JSON.stringify({ error: `Auth update failed: ${updateAuthError.message}` }),
        { status: 500, headers: corsHeaders }
      );
    }

    // Upsert into public.profiles
    const { error: upsertProfileError } = await supabaseAdmin
      .from('profiles')
      .upsert(
        {
          id: user_id,
          email: user_email,
          user_role: newRole,
          full_name: full_name || null,
          avatar_url: avatar_url || null,
          updated_at: new Date().toISOString()
        },
        { onConflict: 'id' }
      );

    if (upsertProfileError) {
      console.error('Error upserting into public.profiles:', upsertProfileError.message);
      return new Response(
        JSON.stringify({ error: `Profile upsert failed: ${upsertProfileError.message}` }),
        { status: 500, headers: corsHeaders }
      );
    }

    console.log(`User ${user_email} (${user_id}) processed. Role: ${newRole}. Profile upserted/updated.`);
    return new Response(
      JSON.stringify({
        success: true,
        userId: user_id,
        userRole: newRole
      }),
      { status: 200, headers: corsHeaders }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    console.error('Unhandled error in set-user-role function:', errorMessage);
    return new Response(
      JSON.stringify({ error: `An unexpected error occurred: ${errorMessage}` }),
      { status: 500, headers: corsHeaders }
    );
  }
});