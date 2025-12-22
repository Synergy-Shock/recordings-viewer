import { NextRequest, NextResponse } from 'next/server'
import { getSessionNotes, findSessionPrefix } from '@/lib/s3'

export const dynamic = 'force-dynamic'

/**
 * Get notes count for multiple sessions at once
 * Query params:
 *   - org: organization ID
 *   - device: device ID
 *   - ids: comma-separated list of session fullIds
 *
 * Returns: { [fullId]: count }
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const org = searchParams.get('org')
    const device = searchParams.get('device')
    const idsParam = searchParams.get('ids')

    if (!org || !device || !idsParam) {
      return NextResponse.json(
        { error: 'Missing org, device, or ids parameter' },
        { status: 400 }
      )
    }

    const ids = idsParam.split(',').filter(Boolean)
    if (ids.length === 0) {
      return NextResponse.json({ counts: {} })
    }

    // Fetch notes counts in parallel
    const counts: Record<string, number> = {}

    await Promise.all(
      ids.map(async (fullId) => {
        try {
          const notes = await getSessionNotes(org, device, fullId)
          counts[fullId] = notes.length
        } catch {
          // Session might not have notes file - count as 0
          counts[fullId] = 0
        }
      })
    )

    return NextResponse.json({ counts })
  } catch (error) {
    console.error('Failed to get notes counts:', error)
    return NextResponse.json(
      { error: 'Failed to get notes counts', details: String(error) },
      { status: 500 }
    )
  }
}
