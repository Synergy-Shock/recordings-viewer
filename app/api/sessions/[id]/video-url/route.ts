import { NextRequest, NextResponse } from 'next/server'
import { getPresignedUrl, findSessionPrefix } from '@/lib/s3'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const { searchParams } = new URL(request.url)
  const org = searchParams.get('org')
  const device = searchParams.get('device')

  if (!id) {
    return NextResponse.json({ error: 'Session ID required' }, { status: 400 })
  }

  if (!org || !device) {
    return NextResponse.json({ error: 'Missing org or device parameter' }, { status: 400 })
  }

  try {
    // Get presigned URL for screen video
    const prefix = await findSessionPrefix(org, device, id)
    if (!prefix) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    }
    const videoKey = `${prefix}/screen/video.mp4`
    const url = await getPresignedUrl(videoKey)

    return NextResponse.json({ url })
  } catch (error) {
    console.error('Error getting video URL:', error)
    return NextResponse.json({ error: 'Failed to get video URL' }, { status: 500 })
  }
}
