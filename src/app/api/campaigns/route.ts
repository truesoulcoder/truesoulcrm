// src/app/api/campaigns/route.ts
import { createRouteHandlerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import type { Database, User } from '@/types'

// Define valid campaign statuses based on the new enum
const VALID_CAMPAIGN_STATUSES: string[] = [
  'draft',
  'active',
  'paused',
  'completed',
  'archived',
]

export const dynamic = 'force-dynamic'

export async function GET() {
  const supabase = createRouteHandlerClient<Database>({ cookies })
  
  try {
    const { data, error } = await supabase
      .from('campaigns')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      return NextResponse.json(
        { error: 'Failed to fetch campaigns' },
        { status: 500 }
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

export async function POST(request: Request) {
  const supabase = createRouteHandlerClient<Database>({ cookies })
  const campaignData = await request.json()

  try {
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { name, status } = campaignData

    if (!name) {
      return NextResponse.json(
        { error: 'Campaign name is required' },
        { status: 400 }
      )
    }

    const insertPayload: {
      user_id: string
      name: string
      status: string // status will be validated or defaulted to 'draft'
    } = {
      user_id: user.id,
      name: name,
      status: 'draft', // Default status
    }

    if (status) {
      if (!VALID_CAMPAIGN_STATUSES.includes(status as string)) {
        return NextResponse.json(
          { error: `Invalid status value. Must be one of: ${VALID_CAMPAIGN_STATUSES.join(', ')}` },
          { status: 400 }
        )
      }
      insertPayload.status = status as string
    }
    // Ensure only user_id, name, and status are in the payload,
    // adhering to the corrected schema interpretation.

    const { data, error: dbError } = await supabase
      .from('campaigns')
      .insert([insertPayload])
      .select()
      .single()

    if (dbError) {
      console.error('Failed to create campaign:', dbError)
      return NextResponse.json(
        { error: `Failed to create campaign: ${dbError.message}` },
        { status: 500 }
      )
    }

    return NextResponse.json(data, { status: 201 })
  } catch (error: any) {
    console.error('Error in POST /api/campaigns:', error)
    return NextResponse.json(
      { error: `Internal server error: ${error.message}` },
      { status: 500 }
    )
  }
}