import { NextRequest, NextResponse } from 'next/server'
import { getPresignedUrl } from '@/lib/s3'

export async function GET(request: NextRequest) {
  const key = request.nextUrl.searchParams.get('key')

  if (!key) {
    return NextResponse.json({ error: 'Missing key parameter' }, { status: 400 })
  }

  try {
    const url = await getPresignedUrl(key)
    return NextResponse.json({ url })
  } catch (error) {
    console.error('Failed to generate presigned URL:', error)
    return NextResponse.json(
      { error: 'Failed to generate presigned URL', details: String(error) },
      { status: 500 }
    )
  }
}
