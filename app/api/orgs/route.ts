import { NextResponse } from 'next/server'
import { listOrgsWithMetadata } from '@/lib/s3'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const orgs = await listOrgsWithMetadata()
    return NextResponse.json({ orgs })
  } catch (error) {
    console.error('Failed to list orgs:', error)
    return NextResponse.json(
      { error: 'Failed to list organizations', details: String(error) },
      { status: 500 }
    )
  }
}
