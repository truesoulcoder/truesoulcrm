// src/app/api/campaigns/[id]/route.ts
import { createAdminServerClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

async function handleRequest(
  request: Request,
  { params }: { params: { id: string } }
) {
  const supabase = await createAdminServerClient();
  const campaignId = params.id;

  try {
    if (request.method === 'PUT') {
      const updates = await request.json();
      const { data, error } = await supabase
        .from('campaigns')
        .update(updates)
        .eq('id', campaignId)
        .select()
        .single();
      if (error) throw error;
      return NextResponse.json(data);
    }

    if (request.method === 'DELETE') {
      const { error } = await supabase
        .from('campaigns')
        .delete()
        .eq('id', campaignId);
      if (error) throw error;
      return new Response(null, { status: 204 });
    }

    // Default to GET
    const { data, error } = await supabase
      .from('campaigns')
      .select('*')
      .eq('id', campaignId)
      .single();
    if (error || !data) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
    }
    return NextResponse.json(data);
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'An unknown error occurred';
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}

export { handleRequest as GET, handleRequest as PUT, handleRequest as DELETE };