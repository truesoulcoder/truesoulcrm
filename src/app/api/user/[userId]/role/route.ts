// src/app/api/user/[userId]/role/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

type SupabaseAdminError = {
  status?: number;
  message: string;
};

export async function GET(
  request: NextRequest,
  { params }: { params: { userId: string } }
) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    // Explicitly check for environment variables at runtime
    if (!supabaseUrl || !serviceRoleKey) {
      console.error("[API /user/role] Error: Server-side Supabase environment variables are not set.");
      return new NextResponse(
        JSON.stringify({ error: 'Server configuration error: Missing Supabase credentials.' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Create the Supabase admin client inside the handler
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    const { userId } = params;
    if (!userId) {
      return new NextResponse(JSON.stringify({ error: 'User ID is required.' }), { status: 400 });
    }
    
    const { data, error } = await supabaseAdmin.auth.admin.getUserById(userId);
    
    if (error) {
      const adminError = error as SupabaseAdminError;
      console.error(`[API /user/role] Supabase API error for user ${userId}:`, adminError.message);
      return new NextResponse(
        JSON.stringify({ error: `Supabase API error: ${adminError.message}` }),
        { 
          status: adminError.status || 500, 
          headers: { 'Content-Type': 'application/json' } 
        }
      );
    }
    
    if (!data.user) {
      return new NextResponse(JSON.stringify({ error: 'User not found.' }), { status: 404 });
    }

    const role = data.user.app_metadata?.role || 'guest';
    
    return NextResponse.json({ role });

  } catch (e) {
    console.error("[API /user/role] An unexpected error occurred in the handler:", e);
    return new NextResponse(
      JSON.stringify({ error: 'Internal Server Error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}