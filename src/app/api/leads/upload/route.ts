// src/app/api/leads/upload/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import { parse } from 'csv-parse/sync';

export async function POST(request: Request) {
  // 1) Init Supabase with your service-role key
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // 2) Parse the multipart form
  const form = await request.formData();
  const file = form.get('file');
  const jobId = form.get('job_id') as string;
  const userId = form.get('user_id') as string;        // <— you must include user_id in your form
  if (!(file instanceof File) || !jobId || !userId) {
    return NextResponse.json(
      { ok: false, message: 'Missing file, job_id or user_id' },
      { status: 400 }
    );
  }

  // 3) Upload CSV to your bucket
  const filePath = `${userId}/${jobId}-${file.name}`;
  const { error: upErr } = await supabase
    .storage
    .from('lead-uploads')
    .upload(filePath, file);
  if (upErr) throw upErr;

  // 4) Mark 20%
  await supabase
    .from('upload_jobs')
    .update({ status: 'FILE_UPLOADED', progress: 20 })
    .eq('job_id', jobId);

  // 5) Prevent duplicate files
  const { data: dup } = await supabase
    .from('file_imports')
    .select('file_key')
    .eq('file_key', filePath);
  if (dup?.length) {
    await supabase
      .from('upload_jobs')
      .update({ status: 'DUPLICATE_FILE', progress: 100, message: 'Already imported.' })
      .eq('job_id', jobId);
    return NextResponse.json({ ok: false, message: 'Duplicate file' }, { status: 409 });
  }

  // 6) Compute checksum
  const buffer = await file.arrayBuffer();
  const checksum = crypto.createHash('md5').update(Buffer.from(buffer)).digest('hex');

  // 7) Download & parse CSV
  const { data: dlData, error: dlErr } = await supabase
    .storage
    .from('lead-uploads')
    .download(filePath);
  if (dlErr || !dlData) throw dlErr ?? new Error('Download failed');
  const text = await new Response(dlData).text();
  const rows = parse(text, { columns: true, skip_empty_lines: true });

  // 8) Stage into your staging table
  await supabase
    .from('staging_contacts_csv')
    .insert(rows);
  await supabase
    .from('upload_jobs')
    .update({ status: 'STAGING_LOADED', progress: 50 })
    .eq('job_id', jobId);

  // 9) Call your SQL import function, passing user_id
  const { error: rpcErr } = await supabase.rpc(
    'import_from_staging_csv',
    { p_user_id: userId }
  );
  if (rpcErr) throw rpcErr;
  await supabase
    .from('upload_jobs')
    .update({ status: 'PARSED', progress: 80 })
    .eq('job_id', jobId);

  // 10) Record the import
  await supabase
    .from('file_imports')
    .insert({ file_key: filePath, checksum, row_count: rows.length });

  // 11) Finish at 100%
  await supabase
    .from('upload_jobs')
    .update({ status: 'COMPLETE', progress: 100 })
    .eq('job_id', jobId);

  return NextResponse.json({ ok: true, job_id: jobId, message: 'Import complete' });
}
