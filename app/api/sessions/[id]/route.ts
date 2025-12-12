import { NextRequest, NextResponse } from 'next/server'
import { DeleteObjectsCommand, ListObjectsV2Command } from '@aws-sdk/client-s3'
import { s3Client, BUCKET } from '@/lib/s3'

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  if (!id) {
    return NextResponse.json({ error: 'Missing session ID' }, { status: 400 })
  }

  try {
    // List all objects with the session prefix
    const listCommand = new ListObjectsV2Command({
      Bucket: BUCKET,
      Prefix: `${id}/`,
    })

    const listResponse = await s3Client.send(listCommand)
    const objects = listResponse.Contents || []

    if (objects.length === 0) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    }

    // Delete all objects
    const deleteCommand = new DeleteObjectsCommand({
      Bucket: BUCKET,
      Delete: {
        Objects: objects.map((obj) => ({ Key: obj.Key })),
        Quiet: false,
      },
    })

    const deleteResponse = await s3Client.send(deleteCommand)

    return NextResponse.json({
      success: true,
      deletedCount: deleteResponse.Deleted?.length || 0,
      sessionId: id,
    })
  } catch (error) {
    console.error('Failed to delete session:', error)
    return NextResponse.json(
      { error: 'Failed to delete session', details: String(error) },
      { status: 500 }
    )
  }
}
