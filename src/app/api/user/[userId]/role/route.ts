// src/app/api/user/[userId]/role/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Define common CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

// Handler for preflight OPTIONS requests
export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

export async function GET(
  request: NextRequest,
  { params }: { params: { userId: string } }
) {
  try {
    const { userId } = params;

    // Validate that the Service Role Key is present
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!serviceRoleKey) {
      throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set on the server.');
    }

    // Create the admin client here to ensure keys are loaded
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      serviceRoleKey
    );

    if (!userId) {
      return NextResponse.json({ error: 'User ID is required.' }, { status: 400, headers: corsHeaders });
    }

    const { data, error } = await supabaseAdmin.auth.admin.getUserById(userId);

    if (error) {
      // Throw the actual Supabase error to be caught below
      throw new Error(`Supabase admin error: ${error.message}`);
    }

    if (!data.user) {
      return NextResponse.json({ error: 'User not found.' }, { status: 404, headers: corsHeaders });
    }

    const role = data.user.app_metadata?.role || 'guest';

    return NextResponse.json({ role }, { headers: corsHeaders });

  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : 'An unknown error occurred.';
    // Log the detailed error to the server console for debugging
    console.error("[API /user/role] CRITICAL ERROR:", errorMessage);
    
    // Return a proper JSON error response
    return NextResponse.json(
      { error: 'Internal Server Error', details: errorMessage },
      { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
    );
  }
}