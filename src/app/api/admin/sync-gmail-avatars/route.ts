import { people, people_v1 } from '@googleapis/people';
import { createClient } from '@supabase/supabase-js';
import { JWT } from 'google-auth-library';
import { NextResponse } from 'next/server';

// Ensure these are set in your .env.local
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const googleServiceAccountKeyJson = process.env.GOOGLE_SERVICE_ACCOUNT_KEY!;

const supabaseAdmin = createClient(supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const SCOPES = ['https://www.googleapis.com/auth/userinfo.profile'];

interface EmailSender {
  id: string;
  email: string;
  name: string;
  avatar_url?: string | null;
}

export async function GET() {
  if (!supabaseUrl || !supabaseServiceRoleKey || !googleServiceAccountKeyJson) {
    return NextResponse.json({ error: 'Missing environment variables' }, { status: 500 });
  }

  try {
    const serviceAccountCredentials = JSON.parse(googleServiceAccountKeyJson);

    const { data: senders, error: fetchError } = await supabaseAdmin
      .from('senders')
      .select('id, email, name, avatar_url');

    if (fetchError) {
      console.error('Error fetching senders from Supabase:', fetchError);
      return NextResponse.json({ error: 'Failed to fetch senders', details: fetchError.message }, { status: 500 });
    }

    if (!senders || senders.length === 0) {
      return NextResponse.json({ message: 'No senders found to process.' });
    }

    const results = [];
    let updatedCount = 0;
    let unchangedCount = 0;
    let errorCount = 0;

    for (const sender of senders as EmailSender[]) {
      try {
        const jwtClient = new JWT({
          email: serviceAccountCredentials.client_email,
          key: serviceAccountCredentials.private_key,
          scopes: SCOPES,
          subject: sender.email, // Impersonate the target user
        });

        const peopleService: people_v1.People = people({
          version: 'v1',
          auth: jwtClient,
        });

        const person = await peopleService.people.get({
          resourceName: 'people/me',
          personFields: 'photos',
        });

        const photoUrl = person.data.photos?.find(photo => photo.default)?.url || null;

        if (photoUrl && photoUrl !== sender.avatar_url) {
          const { error: updateError } = await supabaseAdmin
            .from('senders')
            .update({ avatar_url: photoUrl })
            .eq('id', sender.id);

          if (updateError) {
            console.error(`Error updating avatar for ${sender.email}:`, updateError);
            results.push({ email: sender.email, status: 'error', message: updateError.message });
            errorCount++;
          } else {
            results.push({ email: sender.email, status: 'updated', newAvatarUrl: photoUrl });
            updatedCount++;
          }
        } else if (photoUrl && photoUrl === sender.avatar_url) {
            results.push({ email: sender.email, status: 'unchanged', avatarUrl: photoUrl });
            unchangedCount++;
        } else {
          results.push({ email: sender.email, status: 'no_photo_found' });
          unchangedCount++; // Or potentially mark as an issue if expected
        }
      } catch (peopleApiError: any) {
        console.error(`Error fetching photo for ${sender.email} from People API:`, peopleApiError);
        results.push({ email: sender.email, status: 'error', message: peopleApiError.message || 'People API Error' });
        errorCount++;
      }
    }

    return NextResponse.json({
      message: 'Avatar sync process completed.',
      summary: {
        totalSenders: senders.length,
        updated: updatedCount,
        unchangedOrNoPhoto: unchangedCount,
        errors: errorCount,
      },
      results,
    });

  } catch (e: any) {
    console.error('Unhandled error in sync-gmail-avatars:', e);
    return NextResponse.json({ error: 'Internal server error', details: e.message }, { status: 500 });
  }
}