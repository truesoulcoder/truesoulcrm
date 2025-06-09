// src/app/api/leads/upload/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { parse } from 'papaparse';
import { type Database, TablesInsert } from '@/types/supabase';

// Define type aliases for convenience
type PropertyInsert = TablesInsert<'properties'>;
type ContactInsert = TablesInsert<'contacts'>;
type JobUpdate = TablesInsert<'upload_jobs'>;

// Helper functions for safe data type conversion from CSV strings
const safeParseFloat = (value: any): number | null => {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  const num = parseFloat(String(value).replace(/[^0-9.-]+/g, ''));
  return isNaN(num) ? null : num;
};
const safeParseInt = (value: any): number | null => {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  const num = parseInt(String(value).replace(/[^0-9.-]+/g, ''), 10);
  return isNaN(num) ? null : num;
};
const safeFormatDate = (value: any): string | null => {
  if (!value) return null;
  const date = new Date(value);
  return isNaN(date.getTime()) ? null : date.toISOString();
};


// Main API Route Handler
export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const file = formData.get('file') as File | null;
  const marketRegion = formData.get('market_region') as string | null;
  const clientJobId = formData.get('job_id') as string | null;

  // Use service_role key for backend operations to bypass RLS for this trusted route
  const supabase = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Authenticate the user who initiated the request
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return NextResponse.json({ ok: false, error: 'Authorization header is missing or invalid.' }, { status: 401 });
  }
  const token = authHeader.split(' ')[1];
  const { data: { user } } = await supabase.auth.getUser(token);
  if (!user) {
    return NextResponse.json({ ok: false, error: 'User not authenticated. Invalid token.' }, { status: 401 });
  }

  if (!file || !marketRegion || !clientJobId) {
    return NextResponse.json({ ok: false, error: 'File, market region, and job ID are required.' }, { status: 400 });
  }
  
  const job_id = clientJobId;
  let jobState: JobUpdate = { job_id, user_id: user.id, file_name: file.name, status: 'PENDING' };

  try {
    // --- Step 1: Create initial job record & save file ---
    jobState = { ...jobState, progress: 5, message: 'Saving file and starting job...' };
    await supabase.from('upload_jobs').insert(jobState);
    const filePath = `${user.id}/${job_id}-${file.name}`;
    await supabase.storage.from('lead-uploads').upload(filePath, file);

    // --- Step 2: Parse the entire CSV ---
    jobState = { ...jobState, progress: 10, message: 'Parsing CSV file...' };
    await supabase.from('upload_jobs').update(jobState).eq('job_id', job_id);
    const csvText = await file.text();
    const parseResult = await new Promise<any[]>((resolve, reject) => {
        parse(csvText, {
            header: true, skipEmptyLines: true,
            transformHeader: h => h.trim().toLowerCase().replace(/[^a-z0-9]/g, ''),
            complete: results => resolve(results.data),
            error: error => reject(error),
        });
    });
    if (!parseResult || parseResult.length === 0) throw new Error('CSV is empty or could not be parsed.');
    
    // --- Step 3: Prepare all unique properties from the CSV ---
    const propertyMap = new Map<string, PropertyInsert>();
    parseResult.forEach(row => {
        const addressKey = `${row.propertyaddress || ''}-${row.propertypostalcode || ''}`.toLowerCase();
        if (!addressKey || addressKey === '-') return;
        if (!propertyMap.has(addressKey)) {
             propertyMap.set(addressKey, {
                user_id: user.id, market_region: marketRegion, status: 'New Lead',
                owner_type: row.ownertype || null, property_address: row.propertyaddress || null,
                property_city: row.propertycity || null, property_state: row.propertystate || null,
                property_postal_code: row.propertypostalcode || null, property_type: row.propertytype || null,
                year_built: safeParseInt(row.yearbuilt), square_footage: safeParseInt(row.squarefootage),
                lot_size_sqft: safeParseFloat(row.lotsizesqft), beds: safeParseInt(row.beds),
                baths: safeParseFloat(row.baths), price_per_sqft: safeParseFloat(row.pricepersqft),
                assessed_year: safeParseInt(row.assessedyear), assessed_total: safeParseFloat(row.assessedtotal),
                market_value: safeParseFloat(row.marketvalue), wholesale_value: safeParseFloat(row.wholesalevalue),
                avm: safeParseFloat(row.avm), mls_listing_id: row.mlscurrlistingid || null,
                mls_status: row.mlscurrstatus || null, mls_list_date: safeFormatDate(row.mlscurrlistdate),
                mls_sold_date: safeFormatDate(row.mlscurrsolddate), mls_days_on_market: safeParseInt(row.mlscurrdaysonmarket),
                mls_list_price: safeParseFloat(row.mlscurrlistprice), mls_sale_price: safeParseFloat(row.mlscurrsaleprice),
            });
        }
    });

    // --- Step 4: Upsert properties in batches ---
    const propertiesToUpsert = Array.from(propertyMap.values());
    const totalProperties = propertiesToUpsert.length;
    if (totalProperties === 0) throw new Error("No valid properties found in CSV.");

    const CHUNK_SIZE = 100;
    for (let i = 0; i < totalProperties; i += CHUNK_SIZE) {
        const chunk = propertiesToUpsert.slice(i, i + CHUNK_SIZE);
        const progress = 10 + Math.round(((i + chunk.length) / totalProperties) * 40); // 10% -> 50%
        jobState = { ...jobState, progress, message: `Saving properties... (${i + chunk.length} of ${totalProperties})` };
        await supabase.from('upload_jobs').update(jobState).eq('job_id', job_id);
        const { error } = await supabase.from('properties').upsert(chunk, { onConflict: 'user_id,property_address,property_postal_code' });
        if (error) throw error;
    }

    // --- Step 5: Prepare all contacts, linking to now-existing properties ---
    const { data: allDbProperties } = await supabase.from('properties').select('property_id, property_address, property_postal_code');
    const propertyIdMap = new Map<string, string>();
    allDbProperties?.forEach(p => propertyIdMap.set(`${p.property_address || ''}-${p.property_postal_code || ''}`.toLowerCase(), p.property_id));

    const contactMap = new Map<string, ContactInsert>();
    parseResult.forEach(row => {
        const addressKey = `${row.propertyaddress || ''}-${row.propertypostalcode || ''}`.toLowerCase();
        const property_id = propertyIdMap.get(addressKey);
        if (!property_id) return;
        
        const ownerName = `${row.firstname || ''} ${row.lastname || ''}`.trim();
        // Create contacts for all found emails, assigning roles
        for (let c = 1; c <= 3; c++) {
            const name = row[`contact${c}name`];
            if (!name) continue;
            for (let e = 1; e <= 3; e++) {
                const email = row[`contact${c}email${e}`];
                if (email && email.includes('@') && !contactMap.has(property_id + email)) {
                    contactMap.set(property_id + email, {
                        property_id, user_id: user.id, name, email, phone: row[`contact${c}phone1`] || null,
                        role: ownerName && name === ownerName ? 'owner' : 'alternate_contact',
                        mailing_address: ownerName && name === ownerName ? row.recipientaddress : null,
                        mailing_city: ownerName && name === ownerName ? row.recipientcity : null,
                        mailing_state: ownerName && name === ownerName ? row.recipientstate : null,
                        mailing_postal_code: ownerName && name === ownerName ? row.recipientpostalcode : null,
                    });
                }
            }
        }
        const agentName = row.mlscurrlistagentname;
        const agentEmail = row.mlscurrlistagentemail;
        if (agentName && agentEmail && agentEmail.includes('@') && !contactMap.has(property_id + agentEmail)) {
             contactMap.set(property_id + agentEmail, {
                property_id, user_id: user.id, name: agentName, email: agentEmail,
                phone: row.mlscurrlistagentphone || null, role: 'mls_agent',
            });
        }
    });
    
    // --- Step 6: Upsert contacts in batches ---
    const contactsToUpsert = Array.from(contactMap.values());
    const totalContacts = contactsToUpsert.length;
    for (let i = 0; i < totalContacts; i += CHUNK_SIZE) {
        const chunk = contactsToUpsert.slice(i, i + CHUNK_SIZE);
        const progress = 50 + Math.round(((i + chunk.length) / totalContacts) * 50); // 50% -> 100%
        jobState = { ...jobState, progress, message: `Saving contacts... (${i + chunk.length} of ${totalContacts})` };
        await supabase.from('upload_jobs').update(jobState).eq('job_id', job_id);
        const { error } = await supabase.from('contacts').upsert(chunk, { onConflict: 'property_id,email' });
        if (error) throw error;
    }

    // --- Step 7: Finalize Job ---
    jobState = { ...jobState, status: 'COMPLETE', progress: 100, message: `Success! Processed ${parseResult.length} rows, creating/updating ${totalProperties} properties and ${totalContacts} contacts.` };
    await supabase.from('upload_jobs').update(jobState).eq('job_id', job_id);
    
    return NextResponse.json({ ok: true, message: "File processed successfully.", job_id });

  } catch (error: any) {
    console.error('API Error in /api/leads/upload:', error);
    jobState = { ...jobState, status: 'FAILED', progress: 100, message: error.message };
    // Use an unscoped client to update the job status in case of failure
    const adminClient = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
    await adminClient.from('upload_jobs').update(jobState).eq('job_id', job_id);
    return NextResponse.json({ ok: false, error: 'Failed to process file upload.', details: error.message }, { status: 500 });
  }
}