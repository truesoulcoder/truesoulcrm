import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
// Using the version from your package.json for consistency
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.8';

console.log('Function `set-user-role` up and running!');

// Standard CORS headers. Using '*' for broad compatibility during development and deployment.
// For stricter security, you could replace '*' with your Vercel app's URL.
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Immediately handle CORS preflight requests.
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Enforce POST method for all other requests
    if (req.method !== 'POST') {
      throw new Error('Method not allowed');
    }

    // Get the JWT from the Authorization header to verify the user
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('No authorization header');
    }
    const token = authHeader.replace('Bearer ', '');

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: { headers: { Authorization: `Bearer ${token}` } },
        auth: {
            autoRefreshToken: false,
            persistSession: false
        }
      }
    );

    // Verify the token is valid by fetching the user
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) {
      throw new Error('Invalid or expired token');
    }

    // Safely parse the request body
    const { user_email, user_id, user_role, full_name, avatar_url } = await req.json();

    if (!user_email || !user_id) {
      throw new Error('Missing required fields: user_email and user_id');
    }

    // Initialize Supabase admin client for privileged operations
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // --- Your Core Business Logic (Unchanged) ---
    let newRole = user_role;
    if (user_email === 'chrisphillips@truesoulpartners.com') {
      newRole = 'superadmin';
    } else if (!newRole) {
      newRole = 'guest';
    }

    const { error: updateAuthError } = await supabaseAdmin.auth.admin.updateUserById(user_id, {
      user_metadata: { user_role: newRole, full_name, avatar_url },
    });
    if (updateAuthError) throw new Error(`Auth update failed: ${updateAuthError.message}`);

    const { error: upsertProfileError } = await supabaseAdmin.from('profiles').upsert({
      id: user_id,
      email: user_email,
      user_role: newRole,
      full_name,
      avatar_url,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'id' });
    if (upsertProfileError) throw new Error(`Profile upsert failed: ${upsertProfileError.message}`);

    console.log(`User ${user_email} (${user_id}) processed. Role: ${newRole}. Profile updated.`);

    // --- Success Response ---
    return new Response(
      JSON.stringify({ success: true, userId: user_id, userRole: newRole }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    console.error('Error in set-user-role function:', errorMessage);

    // --- Error Response ---
    let status = 500;
    if (errorMessage === 'Method not allowed') status = 405;
    if (errorMessage === 'No authorization header' || errorMessage === 'Invalid or expired token') status = 401;
    if (errorMessage.includes('Missing required fields')) status = 400;

    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status,
      }
    );
  }
});