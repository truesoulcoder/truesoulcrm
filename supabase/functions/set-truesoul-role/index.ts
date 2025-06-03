import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

console.log("Function 'set-truesoul-role' initializing...");

// Define a type for the expected user record structure from the webhook
interface UserRecord {
  id: string;
  email?: string;
  raw_app_meta_data?: {
    role?: string;
    [key: string]: any; // Allow other properties
  };
  // Add any other fields from the user record you might need
}

// Define a type for the webhook payload
interface WebhookPayload {
  type: 'INSERT' | 'UPDATE' | 'DELETE';
  table: string;
  record: UserRecord | null;
  old_record: UserRecord | null;
  schema: string;
}

serve(async (req: Request) => {
  console.log(`[set-truesoul-role] Received request: ${req.method}`);

  if (req.method !== 'POST') {
    console.warn(`[set-truesoul-role] Method Not Allowed: ${req.method}`);
    return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const payload = await req.json() as WebhookPayload;
    console.log("[set-truesoul-role] Request payload:", JSON.stringify(payload, null, 2));

    // Specifically for auth.users INSERT, the user details are in payload.record
    const userRecord = payload.record;

    if (payload.type !== 'INSERT' || payload.table !== 'users' || !userRecord) {
      console.log(`[set-truesoul-role] Payload not for auth.users INSERT or record missing. Type: ${payload.type}, Table: ${payload.table}. Skipping.`);
      return new Response(JSON.stringify({ message: 'Irrelevant event, skipping role assignment.' }), {
        status: 200, // Acknowledge receipt, but no action taken
        headers: { 'Content-Type': 'application/json' },
      });
    }
    
    if (!userRecord.email) {
      console.error('[set-truesoul-role] User record or email missing in INSERT event.');
      return new Response(JSON.stringify({ error: 'User record or email missing' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const userEmail = userRecord.email;
    const expectedDomain = '@truesoulpartners.com';
    let newRole: string | null = userRecord.raw_app_meta_data?.role || null; // Start with existing role or null

    console.log(`[set-truesoul-role] Processing user: ${userEmail}, Current app_metadata role: ${newRole}`);

    // Initialize Supabase admin client
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !serviceRoleKey) {
      console.error('[set-truesoul-role] SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables not set.');
      return new Response(JSON.stringify({ error: 'Server configuration error: Missing Supabase credentials.' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const supabaseAdmin: SupabaseClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    let roleChanged = false;

    // Check if the email domain matches
    if (userEmail.endsWith(expectedDomain)) {
      const existingRole = userRecord.raw_app_meta_data?.role;

      if (existingRole === 'superadmin') {
        console.log(`[set-truesoul-role] User ${userEmail} already has role 'superadmin'. No changes made.`);
        // newRole is already 'superadmin'
      } else if (existingRole !== 'crmuser') {
        // If no role, or existing role is not crmuser (and not superadmin), set to crmuser
        newRole = 'crmuser';
        roleChanged = true;
        console.log(`[set-truesoul-role] Assigning role 'crmuser' to user ${userEmail}`);
      } else {
        console.log(`[set-truesoul-role] User ${userEmail} already has role '${existingRole}'. No changes made.`);
      }
    } else {
      console.log(`[set-truesoul-role] User ${userEmail} is not from ${expectedDomain}. No default role assignment by this hook. Current role: '${newRole || 'none'}'`);
      // Optionally, if you want to ensure non-company users who somehow don't get a role set get 'guest':
      // if (!newRole) {
      //   newRole = 'guest';
      //   roleChanged = true;
      //   console.log(`[set-truesoul-role] Assigning 'guest' role to non-company user ${userEmail} as no role was set.`);
      // }
    }

    if (roleChanged && newRole) {
      console.log(`[set-truesoul-role] Attempting to update user ${userRecord.id} with role: ${newRole}`);
      const { data, error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
        userRecord.id,
        { app_metadata: { ...userRecord.raw_app_meta_data, role: newRole } }
      );

      if (updateError) {
        console.error(`[set-truesoul-role] Error updating user role for ${userEmail}:`, updateError.message);
        return new Response(JSON.stringify({ error: `Failed to update user role: ${updateError.message}` }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      console.log(`[set-truesoul-role] Successfully updated role to '${newRole}' for user ${userEmail} (ID: ${userRecord.id})`, data);
    } else {
      console.log(`[set-truesoul-role] No role change needed for user ${userEmail}. Final role state: '${newRole || 'none'}'`);
    }

    return new Response(JSON.stringify({ message: `Role processing complete for ${userEmail}. Role: ${newRole || 'unchanged'}` }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[set-truesoul-role] General error processing request:', error);
    return new Response(JSON.stringify({ error: error.message || 'An unexpected error occurred.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});