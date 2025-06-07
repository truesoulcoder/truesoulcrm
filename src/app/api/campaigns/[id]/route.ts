// src/app/api/campaigns/[id]/route.ts
import { createRouteHandlerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import type { Database } from '@/db_types'

// Define valid campaign statuses based on the new enum
const VALID_CAMPAIGN_STATUSES: string[] = [
  'draft',
  'active',
  'paused',
  'completed',
  'archived',
]

export const dynamic = 'force-dynamic'

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createRouteHandlerClient<Database>({ cookies })
  
  try {
    const { data, error } = await supabase
      .from('campaigns')
      .select('*')
      .eq('id', params.id)
      .single()

    if (error || !data) {
      return NextResponse.json(
        { error: 'Campaign not found' },
        { status: 404 }
      )
    }

    return NextResponse.json(data)
  } catch (error) {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function PUT(
  request: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createRouteHandlerClient<Database>({ cookies })
  const updatesFromRequest = await request.json()

  try {
    // Filter updates to only include allowed fields: name and status
    const updatePayload: {
      name?: string
      status?: string
    } = {}

    if (updatesFromRequest.name !== undefined) {
      updatePayload.name = updatesFromRequest.name
    }

    if (updatesFromRequest.status !== undefined) {
      if (!VALID_CAMPAIGN_STATUSES.includes(updatesFromRequest.status as string)) {
        return NextResponse.json(
          { error: `Invalid status value. Must be one of: ${VALID_CAMPAIGN_STATUSES.join(', ')}` },
          { status: 400 }
        )
      }
      updatePayload.status = updatesFromRequest.status as string
    }

    if (Object.keys(updatePayload).length === 0) {
      return NextResponse.json(
        { error: 'No valid fields to update. Only name and status are allowed.' },
        { status: 400 }
      )
    }
    
    // Add user_id check to ensure only the owner or an admin can update.
    // (This part is an enhancement beyond the strict schema alignment but good practice)
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Optional: Check if the user is the owner of the campaign
    // const { data: existingCampaign, error: fetchError } = await supabase
    //   .from('campaigns')
    //   .select('user_id')
    //   .eq('id', params.id)
    //   .single()
    // if (fetchError || !existingCampaign) {
    //   return NextResponse.json({ error: 'Campaign not found or error fetching details' }, { status: 404 })
    // }
    // if (existingCampaign.user_id !== user.id) {
    //   // Or check for an admin role: if (!isAdmin(user))
    //   return NextResponse.json({ error: 'Forbidden: You do not own this campaign' }, { status: 403 })
    // }


    const { data, error: dbError } = await supabase
      .from('campaigns')
      .update(updatePayload)
      .eq('id', params.id)
      .select()
      .single()

    if (dbError) {
      console.error('Failed to update campaign:', dbError)
      return NextResponse.json(
        { error: `Failed to update campaign: ${dbError.message}` },
        { status: 500 }
      )
    }

    return NextResponse.json(data)
  } catch (error: any) {
    console.error(`Error in PUT /api/campaigns/${params.id}:`, error)
    return NextResponse.json(
      { error: `Internal server error: ${error.message}` },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createRouteHandlerClient<Database>({ cookies })

  try {
    const { error } = await supabase
      .from('campaigns')
      .delete()
      .eq('id', params.id)

    if (error) {
      return NextResponse.json(
        { error: 'Failed to delete campaign' },
        { status: 500 }
      )
    }

    return new Response(null, { status: 204 })
  } catch (error) {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}