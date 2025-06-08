// src/app/api/user/[userId]/role/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';

interface ErrorResponse {
  error: string;
}

export async function GET(
  request: NextRequest,
  { params }: { params: { userId: string } }
) {
  console.log('[GET /api/user/role] Fetching role for user:', params.userId);
  
  try {
    if (!params.userId || params.userId.length < 1) {
      console.error('[GET /api/user/role] Invalid user ID:', params.userId);
      return NextResponse.json<ErrorResponse>({ error: 'Invalid user ID' }, { status: 400 });
    }
    
    const { data, error } = await supabaseAdmin.auth.admin.getUserById(params.userId);
    
    if (error) {
      console.error('[GET /api/user/role] Supabase error:', error.message);
      return NextResponse.json<ErrorResponse>({ error: error.message }, { status: 500 });
    }
    
    if (!data || !data.user) {
      console.error('[GET /api/user/role] User not found for ID:', params.userId);
      return NextResponse.json<ErrorResponse>({ error: 'User not found' }, { status: 404 });
    }
    
    // **FIXED LINE**: Changed from user_metadata to app_metadata
    const role = data.user.app_metadata?.role || 'guest';
    console.log('[GET /api/user/role] Found role in app_metadata:', role);
    
    return NextResponse.json({ role });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    console.error('[GET /api/user/role] Unexpected error:', errorMessage);
    return NextResponse.json<ErrorResponse>({ error: errorMessage }, { status: 500 });
  }
}