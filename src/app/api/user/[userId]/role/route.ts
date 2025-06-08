// src/app/api/user/[userId]/role/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin'; // Import the centralized admin client

type SupabaseAdminError = {
  status?: number;
  message: string;
};

export async function GET(
  request: NextRequest,
  { params }: { params: { userId: string } }
) {
  try {
    const { userId } = params;
    if (!userId) {
      return new NextResponse(JSON.stringify({ error: 'User ID is required.' }), { status: 400 });
    }
    
    // Use the imported supabaseAdmin client
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