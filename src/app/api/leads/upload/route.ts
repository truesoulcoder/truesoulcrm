// src/app/api/leads/upload/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import { parse } from 'csv-parse/sync';

export async function POST(request: Request) {
  // 1) Init Supabase
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // 2) Auth & extract userId from Bearer JWT
  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.startsWith('Bearer ')
    ? authHeader.substring(7)
    : authHeader;
  const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
  if (authErr || !user) {
    return NextResponse.json({ ok: false, message: 'Not authenticated' }, { status: 401 });
  }
  const userId = user.id;

  // 3) Grab file + job_id
  const form = await request.formData();
  const file = form.get('file');
  const jobId = form.get('job_id') as string;
  if (!(file instanceof File) || !jobId) {
    return NextResponse.json({ ok: false, message: 'Missing file or job_id' }, { status: 400 });
  }

  // 4) Upload to bucket
  const filePath = `${userId}/${jobId}-${file.name}`;
  await supabase.storage.from('lead-uploads').upload(filePath, file);
  await supabase.from('upload_jobs').update({ status: 'FILE_UPLOADED', progress: 20 }).eq('job_id', jobId);

  // 5) Dedupe file_imports
  const { data: dup } = await supabase.from('file_imports').select('file_key').eq('file_key', filePath);
  if (dup?.length) {
    await supabase.from('upload_jobs')
      .update({ status: 'DUPLICATE_FILE', progress: 100, message: 'Already imported.' })
      .eq('job_id', jobId);
    return NextResponse.json({ ok: false, message: 'Duplicate file' }, { status: 409 });
  }

  // 6) Checksum
  const buf = await file.arrayBuffer();
  const checksum = crypto.createHash('md5').update(Buffer.from(buf)).digest('hex');

  // 7) Download & parse CSV
  const { data: dlData, error: dlErr } = await supabase.storage.from('lead-uploads').download(filePath);
  if (dlErr || !dlData) throw dlErr ?? new Error('Download failed');
  const csvText = await new Response(dlData).text();
  const rawRows = parse(csvText, { columns: true, skip_empty_lines: true });

  // 8) Map CamelCase → snake_case
  const rows = rawRows.map((r: Record<string,string>) => ({
    first_name:               r.FirstName,
    last_name:                r.LastName,
    recipient_address:        r.RecipientAddress,
    recipient_city:           r.RecipientCity,
    recipient_state:          r.RecipientState,
    recipient_postal_code:    r.RecipientPostalCode,
    owner_type:               r.OwnerType,
    property_address:         r.PropertyAddress,
    property_city:            r.PropertyCity,
    property_state:           r.PropertyState,
    property_postal_code:     r.PropertyPostalCode,
    property_type:            r.PropertyType,
    year_built:               r.YearBuilt ? parseInt(r.YearBuilt) : null,
    square_footage:           r.SquareFootage ? parseInt(r.SquareFootage) : null,
    lot_size_sqft:            r.LotSizeSqFt ? parseFloat(r.LotSizeSqFt) : null,
    baths:                    r.Baths ? parseFloat(r.Baths) : null,
    beds:                     r.Beds ? parseInt(r.Beds) : null,
    price_per_sqft:           r.PricePerSqFt ? parseFloat(r.PricePerSqFt) : null,
    assessed_year:            r.AssessedYear ? parseInt(r.AssessedYear) : null,
    assessed_total:           r.AssessedTotal ? parseFloat(r.AssessedTotal) : null,
    market_value:             r.MarketValue ? parseFloat(r.MarketValue) : null,
    wholesale_value:          r.WholesaleValue ? parseFloat(r.WholesaleValue) : null,
    avm:                      r.AVM ? parseFloat(r.AVM) : null,

    contact1_name:            r.Contact1Name,
    contact1_phone_1:         r.Contact1Phone_1,
    contact1_email_1:         r.Contact1Email_1,
    contact1_email_2:         r.Contact1Email_2,
    contact1_email_3:         r.Contact1Email_3,

    contact2_name:            r.Contact2Name,
    contact2_phone_1:         r.Contact2Phone_1,
    contact2_email_1:         r.Contact2Email_1,
    contact2_email_2:         r.Contact2Email_2,
    contact2_email_3:         r.Contact2Email_3,

    contact3_name:            r.Contact3Name,
    contact3_phone_1:         r.Contact3Phone_1,
    contact3_email_1:         r.Contact3Email_1,
    contact3_email_2:         r.Contact3Email_2,
    contact3_email_3:         r.Contact3Email_3,

    mls_curr_listingid:       r.MLS_Curr_ListingID,
    mls_curr_status:          r.MLS_Curr_Status,
    mls_curr_listdate:        r.MLS_Curr_ListDate,
    mls_curr_solddate:        r.MLS_Curr_SoldDate,
    mls_curr_daysonmarket:    r.MLS_Curr_DaysOnMarket ? parseInt(r.MLS_Curr_DaysOnMarket) : null,
    mls_curr_listprice:       r.MLS_Curr_ListPrice ? parseFloat(r.MLS_Curr_ListPrice) : null,
    mls_curr_saleprice:       r.MLS_Curr_SalePrice ? parseFloat(r.MLS_Curr_SalePrice) : null,
    mls_curr_listagentname:   r.MLS_Curr_ListAgentName,
    mls_curr_listagentphone:  r.MLS_Curr_ListAgentPhone,
    mls_curr_listagentemail:  r.MLS_Curr_ListAgentEmail,
    mls_curr_pricepersqft:    r.MLS_Curr_PricePerSqft ? parseFloat(r.MLS_Curr_PricePerSqft) : null,
    mls_curr_sqft:            r.MLS_Curr_Sqft ? parseInt(r.MLS_Curr_Sqft) : null,
    mls_curr_beds:            r.MLS_Curr_Beds ? parseInt(r.MLS_Curr_Beds) : null,
    mls_curr_baths:           r.MLS_Curr_Baths ? parseFloat(r.MLS_Curr_Baths) : null,
    mls_curr_garage:          r.MLS_Curr_Garage,
    mls_curr_yearbuilt:       r.MLS_Curr_YearBuilt ? parseInt(r.MLS_Curr_YearBuilt) : null,
    mls_curr_photos:          r.MLS_Curr_Photos
  }));

  // 9) Stage rows
  await supabase.from('staging_contacts_csv').insert(rows);
  await supabase.from('upload_jobs').update({ status: 'STAGING_LOADED', progress: 50 }).eq('job_id', jobId);

  // 10) Import RPC
  await supabase.from('upload_jobs').update({ status: 'PARSING', progress: 60 }).eq('job_id', jobId);
  const { error: rpcErr } = await supabase.rpc('import_from_staging_csv', { p_user_id: userId });
  if (rpcErr) throw rpcErr;
  await supabase.from('upload_jobs').update({ status: 'PARSED', progress: 80 }).eq('job_id', jobId);

  // 11) Record import
  await supabase.from('file_imports').insert({ file_key: filePath, checksum, row_count: rows.length });

  // 12) Finish
  await supabase.from('upload_jobs').update({ status: 'COMPLETE', progress: 100 }).eq('job_id', jobId);
  return NextResponse.json({ ok: true, job_id: jobId, message: 'Import complete' });
}
