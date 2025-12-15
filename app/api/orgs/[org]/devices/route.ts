import { NextRequest, NextResponse } from 'next/server'
import { listDevices } from '@/lib/s3'

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

    const devices = await listDevices(org)
    return NextResponse.json({ org, devices })
  } catch (error) {
    console.error('Failed to list devices:', error)
    return NextResponse.json(
      { error: 'Failed to list devices', details: String(error) },
      { status: 500 }
    )
  }
}
