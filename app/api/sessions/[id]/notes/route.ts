import { NextRequest, NextResponse } from 'next/server'
import { getSessionNotes, addNote, updateNote, deleteNote, NoteResource } from '@/lib/s3'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { searchParams } = new URL(request.url)
    const org = searchParams.get('org')
    const device = searchParams.get('device')

    if (!org || !device) {
      return NextResponse.json(
        { error: 'Missing org or device parameter' },
        { status: 400 }
      )
    }

    const notes = await getSessionNotes(org, device, id)
    return NextResponse.json({ notes })
  } catch (error) {
    console.error('Failed to get notes:', error)
    return NextResponse.json(
      { error: 'Failed to get notes' },
      { status: 500 }
    )
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { searchParams } = new URL(request.url)
    const org = searchParams.get('org')
    const device = searchParams.get('device')

    if (!org || !device) {
      return NextResponse.json(
        { error: 'Missing org or device parameter' },
        { status: 400 }
      )
    }

    const body = await request.json()

    // Validate input
    if (typeof body.timestamp !== 'number' || body.timestamp < 0) {
      return NextResponse.json(
        { error: 'Invalid timestamp' },
        { status: 400 }
      )
    }

    if (typeof body.content !== 'string' || !body.content.trim()) {
      return NextResponse.json(
        { error: 'Content is required' },
        { status: 400 }
      )
    }

    const validResources: NoteResource[] = ['global', 'screen-video', 'screen-audio', 'camera-video', 'audio-raw', 'audio-clean']
    if (!validResources.includes(body.resource)) {
      return NextResponse.json(
        { error: 'Invalid resource' },
        { status: 400 }
      )
    }

    const note = await addNote(org, device, id, {
      timestamp: body.timestamp,
      content: body.content.trim(),
      resource: body.resource,
    })

    return NextResponse.json({ note })
  } catch (error) {
    console.error('Failed to add note:', error)
    return NextResponse.json(
      { error: 'Failed to add note' },
      { status: 500 }
    )
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { searchParams } = new URL(request.url)
    const org = searchParams.get('org')
    const device = searchParams.get('device')

    if (!org || !device) {
      return NextResponse.json(
        { error: 'Missing org or device parameter' },
        { status: 400 }
      )
    }

    const body = await request.json()

    if (!body.noteId) {
      return NextResponse.json(
        { error: 'noteId is required' },
        { status: 400 }
      )
    }

    const updates: { content?: string; timestamp?: number; resource?: NoteResource } = {}

    if (typeof body.content === 'string' && body.content.trim()) {
      updates.content = body.content.trim()
    }

    if (typeof body.timestamp === 'number' && body.timestamp >= 0) {
      updates.timestamp = body.timestamp
    }

    const validResources: NoteResource[] = ['global', 'screen-video', 'screen-audio', 'camera-video', 'audio-raw', 'audio-clean']
    if (body.resource && validResources.includes(body.resource)) {
      updates.resource = body.resource
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: 'No valid updates provided' },
        { status: 400 }
      )
    }

    const note = await updateNote(org, device, id, body.noteId, updates)
    if (!note) {
      return NextResponse.json(
        { error: 'Note not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({ note })
  } catch (error) {
    console.error('Failed to update note:', error)
    return NextResponse.json(
      { error: 'Failed to update note' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { searchParams } = new URL(request.url)
    const org = searchParams.get('org')
    const device = searchParams.get('device')
    const noteId = searchParams.get('noteId')

    if (!org || !device) {
      return NextResponse.json(
        { error: 'Missing org or device parameter' },
        { status: 400 }
      )
    }

    if (!noteId) {
      return NextResponse.json(
        { error: 'noteId is required' },
        { status: 400 }
      )
    }

    const success = await deleteNote(org, device, id, noteId)
    if (!success) {
      return NextResponse.json(
        { error: 'Note not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to delete note:', error)
    return NextResponse.json(
      { error: 'Failed to delete note' },
      { status: 500 }
    )
  }
}
