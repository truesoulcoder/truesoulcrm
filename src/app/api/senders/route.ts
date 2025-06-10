import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { Database } from '@/types';

interface CookieStore {
  get(name: string): { value: string } | undefined;
  set(name: string, value: string, options?: CookieOptions): void;
}

const createSupabaseServerClient = (): ReturnType<typeof createServerClient<Database>> => {
  const cookieStore = cookies() as unknown as CookieStore;
  
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          try {
            return cookieStore.get(name)?.value;
          } catch (err) {
            console.error('Error getting cookie:', err);
            return undefined;
          }
        },
        set(name: string, value: string, options: CookieOptions) {
          try {
            cookieStore.set(name, value, options);
          } catch (err) {
            console.error('Error setting cookie:', err);
          }
        },
        remove(name: string, options: CookieOptions) {
          try {
            cookieStore.set(name, '', options);
          } catch (err) {
            console.error('Error removing cookie:', err);
          }
        }
      },
    }
  );
};

export async function POST(request: NextRequest) {
  const supabase = createSupabaseServerClient();

  // Verify session exists
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    return NextResponse.json(
      { error: 'Not authenticated' },
      { status: 401 }
    );
  }

  try {
    const body = await request.json();
    
    // Your sender creation logic here
    const { sender_email, sender_name } = body;

    if (!sender_email) {
      return NextResponse.json({ error: 'sender_email is required' }, { status: 400 });
    }
    if (!sender_name) { 
      return NextResponse.json({ error: 'name is required' }, { status: 400 });
    }

    const { data: newSender, error: insertError } = await supabase
      .from('senders')
      .insert([{ sender_email, sender_name, user_id: session.user.id }]) 
      .select()
      .single();

    if (insertError) {
      console.error('Error adding sender:', insertError);
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    return NextResponse.json(newSender, { status: 201 });
  } catch (error) {
    console.error('Error in POST /api/senders:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function GET() {
  const supabase = createSupabaseServerClient();

  try {
    const { data: senders, error } = await supabase.from('senders').select('*');
    
    if (error) throw error;
    
    return NextResponse.json(senders);
  } catch (error) {
    console.error('Error fetching senders:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  const supabase = createSupabaseServerClient();

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
  } catch (e: unknown) {
    console.error('Unexpected error in DELETE /api/senders:', e);
    const errorMessage = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}