// src/app/api/leads/upload/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import { parse } from 'csv-parse/sync';

// Helper function to sanitize and parse numeric values that might contain currency symbols or commas
function sanitizeAndParseFloat(value: string | null | undefined): number | null {
  if (value === null || value === undefined || value.trim() === '') {
    return null;
  }
  // Remove currency symbols, commas, and any non-numeric characters except the decimal point and negative sign
  const sanitizedValue = value.replace(/[^0-9.-]+/g, "");
  if (sanitizedValue === '') {
    return null;
  }
  const number = parseFloat(sanitizedValue);
  return isNaN(number) ? null : number;
}

function sanitizeAndParseInt(value: string | null | undefined): number | null {
    if (value === null || value === undefined || value.trim() === '') {
      return null;
    }
    // Remove anything that isn't a digit or a negative sign at the start
    const sanitizedValue = value.replace(/[^0-9-]+/g, "");
    if (sanitizedValue === '') {
        return null;
    }
    const number = parseInt(sanitizedValue, 10);
    return isNaN(number) ? null : number;
}


export async function POST(request: Request) {
  // 1) Init Supabase Admin Client
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // 2) Auth & extract userId from Bearer JWT
  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.replace('Bearer ', '');
  const { data: { user }, error: authErr } = await supabase.auth.getUser(token);

  if (authErr || !user) {
    return NextResponse.json({ ok: false, message: 'Not authenticated' }, { status: 401 });
  }
  const userId = user.id;

  // 3) Grab file, job_id, and market_region from FormData
  const form = await request.formData();
  const file = form.get('file');
  const jobId = form.get('job_id') as string;
  const marketRegion = form.get('market_region') as string;

  if (!(file instanceof File) || !jobId || !marketRegion) {
    return NextResponse.json({ ok: false, message: 'Missing file, job_id, or market_region' }, { status: 400 });
  }

  // === MAIN PROCESSING LOGIC WITH ERROR HANDLING ===
  try {
    // 4) Create the initial job record so the client can subscribe to it
    const { error: jobCreateError } = await supabase.from('upload_jobs').insert({
      job_id: jobId,
      user_id: userId,
      file_name: file.name,
      status: 'PENDING',
      progress: 5,
      message: 'Initializing upload...'
    });
    if (jobCreateError) throw jobCreateError;

    // 5) Upload file to Supabase Storage
    const filePath = `${userId}/${jobId}-${file.name}`;
    await supabase.storage.from('lead-uploads').upload(filePath, file);
    await supabase.from('upload_jobs').update({ status: 'FILE_UPLOADED', progress: 20, message: 'File stored successfully.' }).eq('job_id', jobId);

    // 6) Dedupe based on file_imports
    const { data: dup } = await supabase.from('file_imports').select('file_key').eq('file_key', filePath);
    if (dup?.length) {
      await supabase.from('upload_jobs')
        .update({ status: 'FAILED', progress: 100, message: 'This file has already been imported.' })
        .eq('job_id', jobId);
      return NextResponse.json({ ok: false, message: 'Duplicate file' }, { status: 409 });
    }

    // 7) Generate Checksum
    const buf = await file.arrayBuffer();
    const checksum = crypto.createHash('md5').update(Buffer.from(buf)).digest('hex');

    // 8) Download & parse CSV
    const { data: dlData, error: dlErr } = await supabase.storage.from('lead-uploads').download(filePath);
    if (dlErr || !dlData) throw dlErr ?? new Error('File download from storage failed');
    const csvText = await new Response(dlData).text();
    const rawRows = parse(csvText, { columns: true, skip_empty_lines: true });

    // 9) Map CamelCase from CSV to snake_case for the database, using the sanitizer for numeric fields
    const rows = rawRows.map((r: Record<string, string>) => ({
      // Property Info
      property_address:         r.PropertyAddress,
      property_city:            r.PropertyCity,
      property_state:           r.PropertyState,
      property_postal_code:     r.PropertyPostalCode,
      property_type:            r.PropertyType,
      owner_type:               r.OwnerType,
      
      // Property Details (Parsed)
      year_built:               sanitizeAndParseInt(r.YearBuilt),
      square_footage:           sanitizeAndParseInt(r.SquareFootage),
      lot_size_sqft:            sanitizeAndParseFloat(r.LotSizeSqFt),
      baths:                    sanitizeAndParseFloat(r.Baths),
      beds:                     sanitizeAndParseInt(r.Beds),

      // Financials (Sanitized & Parsed)
      price_per_sqft:           sanitizeAndParseFloat(r.PricePerSqFt),
      assessed_year:            sanitizeAndParseInt(r.AssessedYear),
      assessed_total:           sanitizeAndParseFloat(r.AssessedTotal),
      market_value:             sanitizeAndParseFloat(r.MarketValue),
      wholesale_value:          sanitizeAndParseFloat(r.WholesaleValue),
      avm:                      sanitizeAndParseFloat(r.AVM),

      // Recipient/Mailing Info
      first_name:               r.FirstName,
      last_name:                r.LastName,
      recipient_address:        r.RecipientAddress,
      recipient_city:           r.RecipientCity,
      recipient_state:          r.RecipientState,
      recipient_postal_code:    r.RecipientPostalCode,

      // Contact Info
      contact1_name:            r.Contact1Name,
      contact1_phone_1:         r.Contact1Phone_1,
      contact1_email_1:         r.Contact1Email_1,
      contact2_name:            r.Contact2Name,
      contact2_phone_1:         r.Contact2Phone_1,
      contact2_email_1:         r.Contact2Email_1,
      contact3_name:            r.Contact3Name,
      contact3_phone_1:         r.Contact3Phone_1,
      contact3_email_1:         r.Contact3Email_1,

      // MLS Info
      mls_curr_listingid:       r.MLS_Curr_ListingID,
      mls_curr_status:          r.MLS_Curr_Status,
      mls_curr_listdate:        r.MLS_Curr_ListDate,
      mls_curr_solddate:        r.MLS_Curr_SoldDate,
      mls_curr_daysonmarket:    sanitizeAndParseInt(r.MLS_Curr_DaysOnMarket),
      mls_curr_listprice:       sanitizeAndParseFloat(r.MLS_Curr_ListPrice),
      mls_curr_saleprice:       sanitizeAndParseFloat(r.MLS_Curr_SalePrice),
      mls_curr_listagentname:   r.MLS_Curr_ListAgentName,
      mls_curr_listagentphone:  r.MLS_Curr_ListAgentPhone,
      mls_curr_listagentemail:  r.MLS_Curr_ListAgentEmail,
      mls_curr_pricepersqft:    sanitizeAndParseFloat(r.MLS_Curr_PricePerSqft),
      mls_curr_sqft:            sanitizeAndParseInt(r.MLS_Curr_Sqft),
      mls_curr_beds:            sanitizeAndParseInt(r.MLS_Curr_Beds),
      mls_curr_baths:           sanitizeAndParseFloat(r.MLS_Curr_Baths),
      mls_curr_garage:          r.MLS_Curr_Garage,
      mls_curr_yearbuilt:       sanitizeAndParseInt(r.MLS_Curr_YearBuilt),
      mls_curr_photos:          r.MLS_Curr_Photos
    }));

    // 10) Stage rows for processing
    await supabase.from('staging_contacts_csv').insert(rows);
    await supabase.from('upload_jobs').update({ status: 'PROCESSING', progress: 50, message: 'Staged data for import.' }).eq('job_id', jobId);

    // 11) Call the import RPC function with all necessary parameters
    await supabase.from('upload_jobs').update({ status: 'PROCESSING', progress: 60, message: 'Running database import procedure...' }).eq('job_id', jobId);
    
    // MODIFIED: Pass user_id, job_id, and market_region to the RPC function
    const { error: rpcErr } = await supabase.rpc('import_from_staging_csv', { 
      p_user_id: userId,
      p_job_id: jobId,
      p_market_region: marketRegion
    });
    if (rpcErr) throw rpcErr;
    
    await supabase.from('upload_jobs').update({ status: 'PROCESSING', progress: 80, message: 'Database import complete.' }).eq('job_id', jobId);

    // 12) Record the successful import
    await supabase.from('file_imports').insert({ file_key: filePath, checksum, row_count: rows.length, user_id: userId, job_id: jobId });

    // 13) Finalize Job
    await supabase.from('upload_jobs').update({ status: 'COMPLETE', progress: 100, message: 'Import successful!' }).eq('job_id', jobId);
    
    return NextResponse.json({ ok: true, job_id: jobId, message: 'Import complete' });

  } catch (error: any) {
    // === CENTRALIZED ERROR HANDLING ===
    console.error(`[LEAD UPLOAD ERROR] Job ID ${jobId}:`, error);
    
    // Update the job with a FAILED status and the error message
    await supabase.from('upload_jobs')
      .update({ 
        status: 'FAILED', 
        progress: 100, 
        message: error.message || 'An unknown processing error occurred.' 
      })
      .eq('job_id', jobId);

    return NextResponse.json(
      { ok: false, message: 'An error occurred during processing.', details: error.message },
      { status: 500 }
    );
  }
}