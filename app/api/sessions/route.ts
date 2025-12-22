import { NextRequest, NextResponse } from 'next/server'
import { listSessions, getOrgMetadata, getDeviceMetadata } from '@/lib/s3'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const org = searchParams.get('org')
    const device = searchParams.get('device')

    if (!org || !device) {
      return NextResponse.json(
        { error: 'Missing org or device parameter' },
        { status: 400 }
      )
    }

    // Fetch sessions and metadata in parallel
    const [sessions, orgMetadata, deviceMetadata] = await Promise.all([
      listSessions(org, device),
      getOrgMetadata(org),
      getDeviceMetadata(org, device),
    ])

    return NextResponse.json({
      sessions,
      orgName: orgMetadata?.name,
      deviceName: deviceMetadata?.name,
    })
  } catch (error) {
    console.error('Failed to list sessions:', error)
    return NextResponse.json(
      { error: 'Failed to list sessions', details: String(error) },
      { status: 500 }
    )
  }
}
