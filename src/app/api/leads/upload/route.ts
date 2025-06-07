// src/app/api/leads/upload/route.ts
import { promises as fs } from 'fs';
import path from 'path';
import { NextRequest, NextResponse } from 'next/server';
import { SupabaseClient } from '@supabase/supabase-js';
import { parse } from 'papaparse';
import { Database } from '@/types/database.types';
import { createAdminServerClient } from '@/lib/supabase/server';

export const maxDuration = 60;

// Main POST handler for the API route
export async function POST(request: NextRequest) {
  const supabase = await createAdminServerClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ ok: false, error: 'User not authenticated.' }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get('file') as File | null;

  if (!file) {
    return NextResponse.json({ ok: false, error: 'No file provided.' }, { status: 400 });
  }

  const tempDir = path.join('/tmp', 'crm-uploads', user.id);
  const tempFilePath = path.join(tempDir, file.name);

  try {
    // Stream file to a temporary location on the server
    await fs.mkdir(tempDir, { recursive: true });
    await fs.writeFile(tempFilePath, Buffer.from(await file.arrayBuffer()));

    // Process the saved file
    const result = await processCsvFile(tempFilePath, supabase, user.id);

    return NextResponse.json(result);
  } catch (error: any) {
    console.error('API Error in /api/leads/upload:', error);
    return NextResponse.json({ ok: false, error: 'Failed to process file upload.', details: error.message }, { status: 500 });
  } finally {
    // Cleanup the temporary file
    await fs.unlink(tempFilePath).catch(err => console.error(`Failed to cleanup temp file: ${tempFilePath}`, err));
  }
}

// Helper to parse and process the CSV content
async function processCsvFile(filePath: string, supabase: SupabaseClient<Database>, userId: string) {
  const csvText = await fs.readFile(filePath, 'utf-8');
  let totalProcessed = 0;
  
  return new Promise((resolve) => {
    parse(csvText, {
      header: true,
      skipEmptyLines: true,
      chunkSize: 250, // Process in batches of 250
      chunk: async (results, parser) => {
        parser.pause();
        const batch = results.data as Record<string, any>[];
        if (batch.length > 0) {
          const { error: rpcError } = await supabase.rpc('process_raw_lead_batch', {
            raw_leads: batch,
            p_user_id: userId,
          });

          if (rpcError) {
            parser.abort();
            return resolve({ ok: false, error: 'Failed to process lead batch in database.', details: rpcError.message });
          }
          totalProcessed += batch.length;
        }
        parser.resume();
      },
      complete: () => {
        resolve({ ok: true, message: `Successfully processed ${totalProcessed} properties.` });
      },
      error: (error) => {
        resolve({ ok: false, error: 'Failed to parse CSV file.', details: error.message });
      },
    });
  });
}