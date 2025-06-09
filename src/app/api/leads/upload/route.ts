// src/app/api/leads/upload/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import { parse } from 'csv-parse/sync';

export async function POST(request: Request) {
  // 1) Init Supabase with your Service Role key
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // 2) Extract & verify the user from the Bearer JWT
  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.startsWith('Bearer ')
    ? authHeader.slice(7)
    : authHeader;
  const {
    data: { user },
    error: authError
  } = await supabase.auth.getUser(token);
  if (authError || !user) {
    return NextResponse.json(
      { ok: false, message: 'Not authenticated' },
      { status: 401 }
    );
  }
  const userId = user.id;

  // 3) Pull the file + job_id out of the multipart form
  const form = await request.formData();
  const file = form.get('file');
  const jobId = form.get('job_id') as string;
  if (!(file instanceof File) || !jobId) {
    return NextResponse.json(
      { ok: false, message: 'Missing file or job_id' },
      { status: 400 }
    );
  }

  // 4) Upload the CSV to your bucket
  const filePath = `${userId}/${jobId}-${file.name}`;
  const { error: upErr } = await supabase
    .storage
    .from('lead-uploads')
    .upload(filePath, file);
  if (upErr) throw upErr;

  // 5) Progress → 20%
  await supabase
    .from('upload_jobs')
    .update({ status: 'FILE_UPLOADED', progress: 20 })
    .eq('job_id', jobId);

  // 6) Prevent re-importing the same file
  const { data: dup } = await supabase
    .from('file_imports')
    .select('file_key')
    .eq('file_key', filePath);
  if (dup?.length) {
    await supabase
      .from('upload_jobs')
      .update({
        status: 'DUPLICATE_FILE',
        progress: 100,
        message: 'This file has already been imported.'
      })
      .eq('job_id', jobId);
    return NextResponse.json(
      { ok: false, message: 'Duplicate file' },
      { status: 409 }
    );
  }

  // 7) Compute an MD5 checksum
  const buf = await file.arrayBuffer();
  const checksum = crypto
    .createHash('md5')
    .update(Buffer.from(buf))
    .digest('hex');

  // 8) Download & parse the CSV
  const { data: dlData, error: dlErr } = await supabase
    .storage
    .from('lead-uploads')
    .download(filePath);
  if (dlErr || !dlData) throw dlErr ?? new Error('Download failed');
  const csvText = await new Response(dlData).text();
  const rows = parse(csvText, {
    columns: true,
    skip_empty_lines: true
  });

  // 9) Stage into staging_contacts_csv
  await supabase
    .from('staging_contacts_csv')
    .insert(rows);
  await supabase
    .from('upload_jobs')
    .update({ status: 'STAGING_LOADED', progress: 50 })
    .eq('job_id', jobId);

  // 10) Fire your import RPC (upsert props + insert filtered contacts)
  const { error: rpcErr } = await supabase.rpc(
    'import_from_staging_csv',
    { p_user_id: userId }
  );
  if (rpcErr) throw rpcErr;
  await supabase
    .from('upload_jobs')
    .update({ status: 'PARSED', progress: 80 })
    .eq('job_id', jobId);

  // 11) Record the import in file_imports
  await supabase
    .from('file_imports')
    .insert({
      file_key: filePath,
      checksum,
      row_count: rows.length
    });

  // 12) Finalize at 100%
  await supabase
    .from('upload_jobs')
    .update({ status: 'COMPLETE', progress: 100 })
    .eq('job_id', jobId);

  return NextResponse.json({
    ok: true,
    job_id: jobId,
    message: 'Import complete'
  });
}
