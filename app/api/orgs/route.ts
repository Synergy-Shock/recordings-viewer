import { NextResponse } from 'next/server'
import { listOrgs } from '@/lib/s3'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const orgs = await listOrgs()
    return NextResponse.json({ orgs })
  } catch (error) {
    console.error('Failed to list orgs:', error)
    return NextResponse.json(
      { error: 'Failed to list organizations', details: String(error) },
      { status: 500 }
    )
  }
}
