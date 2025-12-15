import { NextResponse } from 'next/server'
import { getPresignedUrl } from '@/lib/s3'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  if (!id) {
    return NextResponse.json({ error: 'Session ID required' }, { status: 400 })
  }

  try {
    // Get presigned URL for screen video
    const videoKey = `${id}/screen/video.mp4`
    const url = await getPresignedUrl(videoKey)

    return NextResponse.json({ url })
  } catch (error) {
    console.error('Error getting video URL:', error)
    return NextResponse.json({ error: 'Failed to get video URL' }, { status: 500 })
  }
}
