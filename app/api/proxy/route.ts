import { NextRequest, NextResponse } from 'next/server'
import { s3Client, BUCKET } from '@/lib/s3'
import { GetObjectCommand } from '@aws-sdk/client-s3'

export async function GET(request: NextRequest) {
  const key = request.nextUrl.searchParams.get('key')

  if (!key) {
    return NextResponse.json({ error: 'Missing key parameter' }, { status: 400 })
  }

  try {
    const command = new GetObjectCommand({
      Bucket: BUCKET,
      Key: key,
    })

    const response = await s3Client.send(command)

    if (!response.Body) {
      return NextResponse.json({ error: 'Empty response from S3' }, { status: 404 })
    }

    // Convert the readable stream to a buffer
    const chunks: Uint8Array[] = []
    const reader = response.Body.transformToWebStream().getReader()

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      chunks.push(value)
    }

    const buffer = Buffer.concat(chunks)

    // Determine content type
    let contentType = response.ContentType || 'application/octet-stream'
    if (key.endsWith('.wav')) contentType = 'audio/wav'
    else if (key.endsWith('.mp4')) contentType = 'video/mp4'
    else if (key.endsWith('.mp3')) contentType = 'audio/mpeg'
    else if (key.endsWith('.vtt')) contentType = 'text/vtt'

    // Don't cache VTT files - they may be regenerated
    // Cache media files for 1 hour
    const cacheControl = key.endsWith('.vtt')
      ? 'no-cache, no-store, must-revalidate'
      : 'public, max-age=3600'

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': contentType,
        'Content-Length': buffer.length.toString(),
        'Cache-Control': cacheControl,
      },
    })
  } catch (error) {
    console.error('Failed to proxy file:', error)
    return NextResponse.json(
      { error: 'Failed to fetch file', details: String(error) },
      { status: 500 }
    )
  }
}
