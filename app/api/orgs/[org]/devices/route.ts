import { NextRequest, NextResponse } from 'next/server'
import { listDevicesWithMetadata, getOrgMetadata } from '@/lib/s3'

export const dynamic = 'force-dynamic'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ org: string }> }
) {
  try {
    const { org } = await params

    if (!org) {
      return NextResponse.json(
        { error: 'Missing organization parameter' },
        { status: 400 }
      )
    }

    // Fetch devices with metadata and org metadata in parallel
    const [devices, orgMetadata] = await Promise.all([
      listDevicesWithMetadata(org),
      getOrgMetadata(org),
    ])

    return NextResponse.json({
      org,
      orgName: orgMetadata?.name,
      devices,
    })
  } catch (error) {
    console.error('Failed to list devices:', error)
    return NextResponse.json(
      { error: 'Failed to list devices', details: String(error) },
      { status: 500 }
    )
  }
}
