import { NextRequest, NextResponse } from 'next/server'
import { getSessionMetadata, updateSessionMetadata } from '@/lib/s3'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const metadata = await getSessionMetadata(id)
    return NextResponse.json(metadata)
  } catch (error) {
    console.error('Failed to get metadata:', error)
    return NextResponse.json(
      { error: 'Failed to get metadata' },
      { status: 500 }
    )
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()

    // Validate input
    const updates: { favorite?: boolean; score?: number | null } = {}

    if (typeof body.favorite === 'boolean') {
      updates.favorite = body.favorite
    }

    if (body.score === null || (typeof body.score === 'number' && body.score >= 1 && body.score <= 5)) {
      updates.score = body.score
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: 'No valid updates provided' },
        { status: 400 }
      )
    }

    const metadata = await updateSessionMetadata(id, updates)

    return NextResponse.json({ success: true, metadata })
  } catch (error) {
    console.error('Failed to update metadata:', error)
    return NextResponse.json(
      { error: 'Failed to update metadata' },
      { status: 500 }
    )
  }
}
