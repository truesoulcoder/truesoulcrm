// src/app/api/leads/upload/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createAdminServerClient } from '@/lib/supabase/server';
import { parse } from 'papaparse';
import type { Database } from '@/types';

type LeadInsert = Database['public']['Tables']['leads']['Insert'];

// Maps common CSV header variations to the database column names.
// This makes the upload more robust to different CSV file formats.
const headerMapping: { [key: string]: keyof LeadInsert } = {
    'email': 'email',
    'first name': 'first_name',
    'firstname': 'first_name',
    'last name': 'last_name',
    'lastname': 'last_name',
    'property address': 'property_address',
    'address': 'property_address',
    'property city': 'property_city',
    'city': 'property_city',
    'property state': 'property_state',
    'state': 'property_state',
    'property postal code': 'property_postal_code',
    'property zip': 'property_postal_code',
    'zip code': 'property_postal_code',
    'postal code': 'property_postal_code',
    'market region': 'market_region',
    'market': 'market_region',
};

// Main POST handler for the API route
export async function POST(request: NextRequest) {
    const supabase = await createAdminServerClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
        return NextResponse.json({ ok: false, error: 'User not authenticated.' }, { status: 401 });
    }

    let formData;
    try {
        formData = await request.formData();
    } catch (e) {
        return NextResponse.json({ ok: false, error: 'Invalid form data.' }, { status: 400 });
    }
    
    const file = formData.get('file') as File | null;
    const marketRegion = formData.get('market_region') as string | null;

    if (!file) {
        return NextResponse.json({ ok: false, error: 'No file provided.' }, { status: 400 });
    }
    if (!marketRegion) {
        return NextResponse.json({ ok: false, error: 'Market region is required.' }, { status: 400 });
    }

    try {
        const csvText = await file.text();
        
        const parseResult = await new Promise<any[]>((resolve, reject) => {
            parse(csvText, {
                header: true,
                skipEmptyLines: true,
                transformHeader: header => header.trim().toLowerCase(),
                complete: (results) => resolve(results.data),
                error: (error) => reject(error),
            });
        });
        
        if (!parseResult || parseResult.length === 0) {
            return NextResponse.json({ ok: false, error: 'CSV file is empty or could not be parsed.' }, { status: 400 });
        }

        const leadsToInsert: LeadInsert[] = parseResult.map(row => {
            const lead: LeadInsert = {
                user_id: user.id,
                email: '', // will be populated from row
                market_region: marketRegion, // Assign market region from form
            };
            
            for (const key in row) {
                const mappedKey = headerMapping[key];
                if (mappedKey) {
                    // This dynamic assignment works because LeadInsert has a string index signature.
                    (lead as any)[mappedKey] = row[key] || null;
                }
            }

            // Ensure email is not null and is a valid-looking string
            if (!lead.email || typeof lead.email !== 'string' || !lead.email.includes('@')) {
                return null; // This lead will be filtered out
            }
            
            return lead;
        }).filter((lead): lead is LeadInsert => lead !== null);

        if (leadsToInsert.length === 0) {
            return NextResponse.json({ ok: false, error: 'No valid leads with emails found in the CSV file.' }, { status: 400 });
        }

        const { error: insertError } = await supabase
            .from('leads')
            .upsert(leadsToInsert, { onConflict: 'user_id,email' });

        if (insertError) {
            console.error('Supabase insert error:', insertError);
            return NextResponse.json({ ok: false, error: 'Failed to save leads to the database.', details: insertError.message }, { status: 500 });
        }

        return NextResponse.json({
            ok: true,
            message: `Successfully processed ${leadsToInsert.length} leads for ${marketRegion}.`,
        });

    } catch (error: any) {
        console.error('API Error in /api/leads/upload:', error);
        return NextResponse.json({ ok: false, error: 'Failed to process file upload.', details: error.message }, { status: 500 });
    }
}