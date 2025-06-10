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
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS, GET, PUT, DELETE',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Content-Type': 'application/json',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Max-Age': '86400'
  };
}

// Helper function to create a response with CORS headers
function responseWithCors(body: any, status: number, headers: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...headers,
      'Access-Control-Allow-Origin': headers['Access-Control-Allow-Origin'] || 'https://truesoulpartners.vercel.app',
      'Access-Control-Allow-Credentials': 'true'
    }
  });
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
    return responseWithCors(null, 204, {
      ...corsHeaders,
      'Access-Control-Allow-Methods': 'POST, OPTIONS, GET, PUT, DELETE',
      'Access-Control-Max-Age': '86400'
    });
  }

  // Only allow POST requests
  if (req.method !== 'POST') {
    return responseWithCors(
      { error: 'Method not allowed' },
      405,
      corsHeaders
    );
  }

  // Get the JWT from the Authorization header
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return responseWithCors(
      { error: 'No authorization header' },
      401,
      corsHeaders
    );
  }

  // Extract token
  const token = authHeader.replace('Bearer ', '');
  const supabaseClient = createSupabaseClient(token);

  try {
    // Verify the token is valid
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) {
      return responseWithCors(
        { error: 'Invalid or expired token' },
        401,
        corsHeaders
      );
    }

    // Parse request body
    let requestData: UserData;
    try {
      requestData = await req.json();
    } catch (e) {
      return responseWithCors(
        { error: 'Invalid JSON body' },
        400,
        corsHeaders
      );
    }

    const { user_email, user_id, user_role, full_name, avatar_url } = requestData;

    // Validate required fields
    if (!user_email || !user_id) {
      return responseWithCors(
        { error: 'Missing user_email or user_id in request' },
        400,
        corsHeaders
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
      return responseWithCors(
        { error: `Auth update failed: ${updateAuthError.message}` },
        500,
        corsHeaders
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
      return responseWithCors(
        { error: `Profile upsert failed: ${upsertProfileError.message}` },
        500,
        corsHeaders
      );
    }

    console.log(`User ${user_email} (${user_id}) processed. Role: ${newRole}. Profile upserted/updated.`);
    return responseWithCors({
      success: true,
      userId: user_id,
      userRole: newRole
    }, 200, corsHeaders);
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    console.error('Unhandled error in set-user-role function:', errorMessage);
    return responseWithCors(
      { error: `An unexpected error occurred: ${errorMessage}` },
      500,
      corsHeaders
    );
  }
});