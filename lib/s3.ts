import { S3Client, ListObjectsV2Command, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

// S3/R2 client configuration
export const s3Client = new S3Client({
  region: process.env.S3_REGION || 'auto',
  endpoint: process.env.S3_ENDPOINT,
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY || '',
    secretAccessKey: process.env.S3_SECRET_KEY || '',
  },
})

export const BUCKET = process.env.S3_BUCKET || 'recordings'

// Expected files for a complete session
export const EXPECTED_FILES = {
  screen: ['screen/video.mp4', 'screen/audio.wav'],
  camera: ['camera/video.mp4'],
  audio: ['audio/raw.wav', 'audio/clean.wav'],
}

export interface SessionFile {
  key: string
  size: number
  lastModified: Date
  type: 'screen-video' | 'screen-audio' | 'camera-video' | 'audio-raw' | 'audio-clean' | 'transcription-screen' | 'transcription-raw' | 'transcription-clean' | 'unknown'
}

export interface SessionMetadata {
  favorite: boolean
  score: number | null
}

export interface Session {
  id: string
  timestamp: Date
  files: SessionFile[]
  hasScreenVideo: boolean
  hasScreenAudio: boolean
  hasCameraVideo: boolean
  hasAudioRaw: boolean
  hasAudioClean: boolean
  hasTranscriptionScreen: boolean
  hasTranscriptionRaw: boolean
  hasTranscriptionClean: boolean
  totalSize: number
  metadata: SessionMetadata
}

function getFileType(key: string): SessionFile['type'] {
  if (key.includes('screen/video')) return 'screen-video'
  if (key.includes('screen/audio.wav')) return 'screen-audio'
  if (key.includes('screen/audio.vtt')) return 'transcription-screen'
  if (key.includes('camera/video')) return 'camera-video'
  if (key.includes('audio/raw.wav')) return 'audio-raw'
  if (key.includes('audio/raw.vtt')) return 'transcription-raw'
  if (key.includes('audio/clean.wav')) return 'audio-clean'
  if (key.includes('audio/clean.vtt')) return 'transcription-clean'
  return 'unknown'
}

export async function listSessions(): Promise<Session[]> {
  const sessions = new Map<string, Session>()

  let continuationToken: string | undefined

  do {
    const command = new ListObjectsV2Command({
      Bucket: BUCKET,
      ContinuationToken: continuationToken,
    })

    const response = await s3Client.send(command)

    for (const obj of response.Contents || []) {
      if (!obj.Key || !obj.Size || !obj.LastModified) continue

      // Extract session ID (first part of the key path)
      const parts = obj.Key.split('/')
      if (parts.length < 2) continue

      const sessionId = parts[0]

      if (!sessions.has(sessionId)) {
        sessions.set(sessionId, {
          id: sessionId,
          timestamp: obj.LastModified,
          files: [],
          hasScreenVideo: false,
          hasScreenAudio: false,
          hasCameraVideo: false,
          hasAudioRaw: false,
          hasAudioClean: false,
          hasTranscriptionScreen: false,
          hasTranscriptionRaw: false,
          hasTranscriptionClean: false,
          totalSize: 0,
          metadata: { favorite: false, score: null },
        })
      }

      const session = sessions.get(sessionId)!
      const fileType = getFileType(obj.Key)

      session.files.push({
        key: obj.Key,
        size: obj.Size,
        lastModified: obj.LastModified,
        type: fileType,
      })

      session.totalSize += obj.Size

      // Update timestamp to latest file
      if (obj.LastModified > session.timestamp) {
        session.timestamp = obj.LastModified
      }

      // Update file presence flags
      switch (fileType) {
        case 'screen-video':
          session.hasScreenVideo = true
          break
        case 'screen-audio':
          session.hasScreenAudio = true
          break
        case 'camera-video':
          session.hasCameraVideo = true
          break
        case 'audio-raw':
          session.hasAudioRaw = true
          break
        case 'audio-clean':
          session.hasAudioClean = true
          break
        case 'transcription-screen':
          session.hasTranscriptionScreen = true
          break
        case 'transcription-raw':
          session.hasTranscriptionRaw = true
          break
        case 'transcription-clean':
          session.hasTranscriptionClean = true
          break
      }
    }

    continuationToken = response.NextContinuationToken
  } while (continuationToken)

  const sessionList = Array.from(sessions.values())

  // Sort by timestamp descending (newest first)
  // Note: metadata is NOT fetched here - it's lazy-loaded by the frontend
  return sessionList.sort(
    (a, b) => b.timestamp.getTime() - a.timestamp.getTime()
  )
}

export async function getPresignedUrl(key: string, expiresIn = 3600): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: BUCKET,
    Key: key,
  })

  return getSignedUrl(s3Client, command, { expiresIn })
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
}

export function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

export async function uploadFile(key: string, content: string | Buffer, contentType: string): Promise<void> {
  const command = new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    Body: content,
    ContentType: contentType,
  })

  await s3Client.send(command)
}

export async function getFileBuffer(key: string): Promise<Buffer> {
  const command = new GetObjectCommand({
    Bucket: BUCKET,
    Key: key,
  })

  const response = await s3Client.send(command)
  const chunks: Uint8Array[] = []

  if (response.Body) {
    // @ts-expect-error - Body is a readable stream
    for await (const chunk of response.Body) {
      chunks.push(chunk)
    }
  }

  return Buffer.concat(chunks)
}

const DEFAULT_METADATA: SessionMetadata = {
  favorite: false,
  score: null,
}

export async function getSessionMetadata(sessionId: string): Promise<SessionMetadata> {
  try {
    const buffer = await getFileBuffer(`${sessionId}/metadata.json`)
    const data = JSON.parse(buffer.toString('utf-8'))
    return {
      favorite: data.favorite ?? false,
      score: data.score ?? null,
    }
  } catch {
    // File doesn't exist or invalid JSON - return defaults
    return { ...DEFAULT_METADATA }
  }
}

export async function updateSessionMetadata(
  sessionId: string,
  updates: Partial<SessionMetadata>
): Promise<SessionMetadata> {
  // Get existing metadata first
  const existing = await getSessionMetadata(sessionId)
  const updated = { ...existing, ...updates }

  // Save to S3
  await uploadFile(
    `${sessionId}/metadata.json`,
    JSON.stringify(updated, null, 2),
    'application/json'
  )

  return updated
}

// Notes
export type NoteResource = 'global' | 'screen-video' | 'screen-audio' | 'camera-video' | 'audio-raw' | 'audio-clean'

export interface Note {
  id: string
  timestamp: number // seconds
  resource: NoteResource
  content: string
  createdAt: string // ISO date
}

export async function getSessionNotes(sessionId: string): Promise<Note[]> {
  try {
    const buffer = await getFileBuffer(`${sessionId}/notes.json`)
    const data = JSON.parse(buffer.toString('utf-8'))
    return Array.isArray(data) ? data : []
  } catch {
    // File doesn't exist or invalid JSON - return empty array
    return []
  }
}

export async function saveSessionNotes(sessionId: string, notes: Note[]): Promise<void> {
  await uploadFile(
    `${sessionId}/notes.json`,
    JSON.stringify(notes, null, 2),
    'application/json'
  )
}

export async function addNote(sessionId: string, note: Omit<Note, 'id' | 'createdAt'>): Promise<Note> {
  const notes = await getSessionNotes(sessionId)
  const newNote: Note = {
    ...note,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
  }
  notes.push(newNote)
  await saveSessionNotes(sessionId, notes)
  return newNote
}

export async function updateNote(sessionId: string, noteId: string, updates: Partial<Pick<Note, 'content' | 'timestamp' | 'resource'>>): Promise<Note | null> {
  const notes = await getSessionNotes(sessionId)
  const index = notes.findIndex(n => n.id === noteId)
  if (index === -1) return null

  notes[index] = { ...notes[index], ...updates }
  await saveSessionNotes(sessionId, notes)
  return notes[index]
}

export async function deleteNote(sessionId: string, noteId: string): Promise<boolean> {
  const notes = await getSessionNotes(sessionId)
  const index = notes.findIndex(n => n.id === noteId)
  if (index === -1) return false

  notes.splice(index, 1)
  await saveSessionNotes(sessionId, notes)
  return true
}
