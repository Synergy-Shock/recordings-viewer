import { NextResponse } from 'next/server'
import { listSessions } from '@/lib/s3'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const sessions = await listSessions()
    return NextResponse.json({ sessions })
  } catch (error) {
    console.error('Failed to list sessions:', error)
    return NextResponse.json(
      { error: 'Failed to list sessions', details: String(error) },
      { status: 500 }
    )
  }
}
