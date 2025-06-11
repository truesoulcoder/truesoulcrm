import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { Database } from '@/types';

// Helper to create Supabase client with full cookie handling
const createSupabaseServerClient = (cookieStore: ReturnType<typeof cookies>) => {
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set({ name, value, ...options });
          });
        }
      },
    }
  );
};

export async function GET(request: NextRequest) {
  const cookieStore = cookies();
  const supabase = createSupabaseServerClient(cookieStore);

  try {
    const { data: senders, error } = await supabase.from('senders').select('*');

    if (error) {
      console.error('Error fetching senders:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(senders);
  } catch (e: any) {
    console.error('Unexpected error in GET /api/senders:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const cookieStore = cookies();
  const supabase = createSupabaseServerClient(cookieStore);

  try {
    // Using 'email' and 'name' as per db_types.ts (senders table definition)
    const { sender_email, sender_name } = await request.json();

    if (!sender_email) {
      return NextResponse.json({ error: 'sender_email is required' }, { status: 400 });
    }
    if (!sender_name) { // Assuming name is also required based on schema (NOT NULL)
      return NextResponse.json({ error: 'name is required' }, { status: 400 });
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      console.error('Auth error in POST /api/senders:', authError);
      return NextResponse.json({ error: 'User not authenticated' }, { status: 401 });
    }

    const { data: newSender, error: insertError } = await supabase
      .from('senders')
      .insert([{ sender_email, sender_name, user_id: user.id }])
      .select()
      .single();

    if (insertError) {
      console.error('Error adding sender:', insertError);
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    return NextResponse.json(newSender, { status: 201 });
  } catch (e: any) {
    console.error('Unexpected error in POST /api/senders:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const cookieStore = cookies();
  const supabase = createSupabaseServerClient(cookieStore);

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id'); // id is a string (UUID)

    if (!id) {
      return NextResponse.json({ error: 'Sender ID is required' }, { status: 400 });
    }

    const { error } = await supabase.from('senders').delete().match({ id }); // Corrected shorthand

    if (error) {
      console.error('Error deleting sender:', error);
      if (error.code === 'PGRST204') { // No content, typically means row not found for delete
        return NextResponse.json({ error: 'Sender not found' }, { status: 404 });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ message: 'Sender deleted successfully' }, { status: 200 });
  } catch (e: any) {
    console.error('Unexpected error in DELETE /api/senders:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}