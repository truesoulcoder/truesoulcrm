// src/app/api/normalized-leads/route.ts
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { Database } from '@/db_types'; // Assuming db_types.ts is updated

type PropertiesRow = Database['public']['Tables']['properties']['Row'];
type ContactsRow = Database['public']['Tables']['contacts']['Row'];

// Define the structure of the "lead" object to be returned
interface CombinedLead extends PropertiesRow {
  property_id: string; // Or number, depending on your actual schema for properties.id
  contact_id: string;  // Or number, for contacts.id
  contact_email: string | null;
  contact_name: string | null;
  contact_source_type: string | null;
}


export async function GET(request: NextRequest) {
  console.log('API: /api/normalized-leads GET request received (new schema).');

  const supabaseAdmin: SupabaseClient<Database> = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { searchParams } = new URL(request.url);
  const page = parseInt(searchParams.get('page') || '1', 10);
  const pageSize = parseInt(searchParams.get('pageSize') || '25', 10);
  const marketRegion = searchParams.get('market_region') || null;

  if (isNaN(page) || page < 1) {
    return NextResponse.json({ ok: false, error: 'Invalid page number.' }, { status: 400 });
  }
  if (isNaN(pageSize) || ![10, 25, 50, 100].includes(pageSize)) {
    return NextResponse.json({ ok: false, error: 'Invalid page size. Must be 10, 25, 50, or 100.' }, { status: 400 });
  }

  const from = (page - 1) * pageSize;
  const to = page * pageSize - 1;

  console.log(`API: Fetching properties page: ${page}, pageSize: ${pageSize}, from: ${from}, to: ${to}, marketRegion: ${marketRegion}`);

  try {
    let propertiesQuery = supabaseAdmin
      .from('properties')
      .select(
        'id, property_address, property_city, property_state, property_postal_code, market_region, property_type, square_footage, lot_size_sq_ft, beds, baths, year_built, assessed_total, mls_curr_status, mls_curr_days_on_market, created_at, updated_at', 
        { count: 'exact' }
      )
      .order('created_at', { ascending: false })
      .range(from, to);

    if (marketRegion && marketRegion.toLowerCase() !== 'all') {
      propertiesQuery = propertiesQuery.eq('market_region', marketRegion);
    }

    const { data: properties, error: propertiesError, count: propertiesCount } = await propertiesQuery;

    if (propertiesError) {
      console.error('API Error: Failed to fetch properties:', propertiesError);
      return NextResponse.json(
        { ok: false, error: 'Failed to fetch properties.', details: propertiesError.message },
        { status: 500 }
      );
    }

    if (!properties || properties.length === 0) {
      console.log('API: No properties found for the given criteria.');
      return NextResponse.json({
        ok: true,
        leads: [],
        totalCount: 0,
        currentPage: page,
        pageSize,
        totalPages: 0,
      });
    }

    console.log(`API: Successfully fetched ${properties.length} properties. Total count: ${propertiesCount}`);

    const propertyIds = properties.map(p => p.id);
    
    const { data: contacts, error: contactsError } = await supabaseAdmin
      .from('contacts')
      .select('*')
      .in('property_id', propertyIds);

    if (contactsError) {
      console.error('API Error: Failed to fetch contacts for properties:', contactsError);
      return NextResponse.json(
        { ok: false, error: 'Failed to fetch associated contacts.', details: contactsError.message },
        { status: 500 }
      );
    }
    
    const contactsByPropertyId = new Map<string, ContactsRow[]>();
    if (contacts) {
      contacts.forEach(contact => {
        if (contact.property_id) {
          const existing = contactsByPropertyId.get(contact.property_id) || [];
          existing.push(contact);
          contactsByPropertyId.set(contact.property_id, existing);
        }
      });
    }

    const combinedLeads: CombinedLead[] = [];
    for (const prop of properties) {
      const propContacts = contactsByPropertyId.get(prop.id) || [];
      if (propContacts.length > 0) {
        for (const contact of propContacts) {
          combinedLeads.push({
            ...(prop as PropertiesRow), // Spread all property fields
            property_id: prop.id, 
            contact_id: contact.id,
            contact_email: contact.email,
            contact_name: contact.name,
            contact_source_type: contact.source_type,
          });
        }
      } else {
        // If a property has no contacts, it won't produce any "lead" records based on the logic.
        // If you need to include properties even without contacts, you would add them here:
        // combinedLeads.push({ ...prop, property_id: prop.id, contact_id: null, ... etc. });
      }
    }
    
    // Note: The `combinedLeads` array might be longer than `pageSize` if properties have multiple contacts.
    // The pagination is currently based on properties. If pagination needs to be based on combined leads,
    // this logic would need adjustment (e.g. fetch more properties initially or apply pagination after combining).
    // For this subtask, property-based pagination with potentially more results than pageSize is the outcome.

    console.log(`API: Constructed ${combinedLeads.length} combined lead objects.`);

    return NextResponse.json({
      ok: true,
      leads: combinedLeads,
      totalCount: propertiesCount, // Total count of properties for pagination
      currentPage: page,
      pageSize,
      totalPages: propertiesCount ? Math.ceil(propertiesCount / pageSize) : 0,
    });

  } catch (error: any) {
    console.error('API: Unhandled error in GET /api/normalized-leads (new schema):', error);
    return NextResponse.json(
      { ok: false, error: 'An unexpected error occurred.', details: error.message },
      { status: 500 }
    );
  }
}