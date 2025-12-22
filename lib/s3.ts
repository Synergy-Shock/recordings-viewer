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
  forcePathStyle: true, // Required for MinIO and other S3-compatible services
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
  id: string           // Display ID: sess_xxxxx
  fullId: string       // Folder name: HH-MM-SS_sess_xxxxx (used in URLs)
  org: string
  device: string
  year: string
  month: string
  day: string
  time: string         // HH-MM-SS
  prefix: string       // Full path: org/device/year/month/day/fullId
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

// Helper to build the full path prefix for a session
export function getSessionPrefix(org: string, device: string, year: string, month: string, day: string, fullId: string): string {
  return `${org}/${device}/${year}/${month}/${day}/${fullId}`
}

// Parse fullId (HH-MM-SS_sess_xxxxx) into time and displayId
export function parseFullId(fullId: string): { time: string; displayId: string } {
  // Format: HH-MM-SS_sess_xxxxx
  const match = fullId.match(/^(\d{2}-\d{2}-\d{2})_(.+)$/)
  if (match) {
    return { time: match[1], displayId: match[2] }
  }
  // Fallback for old format or unexpected input
  return { time: '00-00-00', displayId: fullId }
}

// Find the full prefix path for a session by searching
export async function findSessionPrefix(org: string, device: string, fullId: string): Promise<string | null> {
  // Search for any file under this session
  const searchPrefix = `${org}/${device}/`
  let continuationToken: string | undefined

  do {
    const command = new ListObjectsV2Command({
      Bucket: BUCKET,
      Prefix: searchPrefix,
      ContinuationToken: continuationToken,
    })

    const response = await s3Client.send(command)

    for (const obj of response.Contents || []) {
      if (!obj.Key) continue

      // Path: org/device/year/month/day/fullId/...
      const parts = obj.Key.split('/')
      if (parts.length >= 6 && parts[5] === fullId) {
        // Found it! Return the prefix
        return `${parts[0]}/${parts[1]}/${parts[2]}/${parts[3]}/${parts[4]}/${parts[5]}`
      }
    }

    continuationToken = response.NextContinuationToken
  } while (continuationToken)

  return null
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

// Org/Device metadata from _metadata.json files
export interface OrgMetadata {
  id: string
  name: string
  created_at?: string
}

export interface DeviceMetadata {
  id: string
  name: string
  org_id: string
  org_name: string
  created_at?: string
}

export interface OrgWithMetadata {
  id: string
  name?: string
}

export interface DeviceWithMetadata {
  id: string
  name?: string
}

// Fetch org metadata from {org}/_metadata.json
export async function getOrgMetadata(org: string): Promise<OrgMetadata | null> {
  try {
    const buffer = await getFileBuffer(`${org}/_metadata.json`)
    const data = JSON.parse(buffer.toString('utf-8'))
    return {
      id: data.id || org,
      name: data.name || null,
      created_at: data.created_at,
    }
  } catch {
    // File doesn't exist or invalid JSON
    return null
  }
}

// Fetch device metadata from {org}/{device}/_metadata.json
export async function getDeviceMetadata(org: string, device: string): Promise<DeviceMetadata | null> {
  try {
    const buffer = await getFileBuffer(`${org}/${device}/_metadata.json`)
    const data = JSON.parse(buffer.toString('utf-8'))
    return {
      id: data.id || device,
      name: data.name || null,
      org_id: data.org_id || org,
      org_name: data.org_name || null,
      created_at: data.created_at,
    }
  } catch {
    // File doesn't exist or invalid JSON
    return null
  }
}

// List all organizations in the bucket
export async function listOrgs(): Promise<string[]> {
  const orgs = new Set<string>()
  let continuationToken: string | undefined

  do {
    const command = new ListObjectsV2Command({
      Bucket: BUCKET,
      Delimiter: '/',
      ContinuationToken: continuationToken,
    })

    const response = await s3Client.send(command)

    // CommonPrefixes contains the org-level folders
    for (const prefix of response.CommonPrefixes || []) {
      if (prefix.Prefix) {
        const org = prefix.Prefix.replace(/\/$/, '')
        orgs.add(org)
      }
    }

    continuationToken = response.NextContinuationToken
  } while (continuationToken)

  return Array.from(orgs).sort()
}

// List all organizations with metadata
export async function listOrgsWithMetadata(): Promise<OrgWithMetadata[]> {
  const orgIds = await listOrgs()

  // Fetch metadata for all orgs in parallel
  const orgsWithMetadata = await Promise.all(
    orgIds.map(async (id) => {
      const metadata = await getOrgMetadata(id)
      return {
        id,
        name: metadata?.name,
      }
    })
  )

  return orgsWithMetadata
}

// List all devices for a given organization
export async function listDevices(org: string): Promise<string[]> {
  const devices = new Set<string>()
  let continuationToken: string | undefined

  do {
    const command = new ListObjectsV2Command({
      Bucket: BUCKET,
      Prefix: `${org}/`,
      Delimiter: '/',
      ContinuationToken: continuationToken,
    })

    const response = await s3Client.send(command)

    // CommonPrefixes contains the device-level folders
    for (const prefix of response.CommonPrefixes || []) {
      if (prefix.Prefix) {
        // Extract device name from "org/device/"
        const parts = prefix.Prefix.split('/')
        if (parts.length >= 2 && parts[1]) {
          devices.add(parts[1])
        }
      }
    }

    continuationToken = response.NextContinuationToken
  } while (continuationToken)

  return Array.from(devices).sort()
}

// List all devices with metadata for a given organization
export async function listDevicesWithMetadata(org: string): Promise<DeviceWithMetadata[]> {
  const deviceIds = await listDevices(org)

  // Fetch metadata for all devices in parallel
  const devicesWithMetadata = await Promise.all(
    deviceIds.map(async (id) => {
      const metadata = await getDeviceMetadata(org, id)
      return {
        id,
        name: metadata?.name,
      }
    })
  )

  return devicesWithMetadata
}

// List sessions for a specific org and device
export async function listSessions(org: string, device: string): Promise<Session[]> {
  const sessions = new Map<string, Session>()
  const searchPrefix = `${org}/${device}/`

  let continuationToken: string | undefined

  do {
    const command = new ListObjectsV2Command({
      Bucket: BUCKET,
      Prefix: searchPrefix,
      ContinuationToken: continuationToken,
    })

    const response = await s3Client.send(command)

    for (const obj of response.Contents || []) {
      if (!obj.Key || !obj.Size || !obj.LastModified) continue

      // Path: org/device/year/month/day/HH-MM-SS_sess_xxxxx/file...
      // Parts: [org, device, year, month, day, fullId, file, ...]
      const parts = obj.Key.split('/')
      if (parts.length < 7) continue

      const year = parts[2]
      const month = parts[3]
      const day = parts[4]
      const fullId = parts[5]

      // Validate date parts (should be numeric)
      if (!/^\d{4}$/.test(year) || !/^\d{2}$/.test(month) || !/^\d{2}$/.test(day)) continue

      const prefix = `${org}/${device}/${year}/${month}/${day}/${fullId}`
      const { time, displayId } = parseFullId(fullId)

      // Build timestamp from date components and time
      const [hours, minutes, seconds] = time.split('-').map(Number)
      const sessionTimestamp = new Date(
        parseInt(year),
        parseInt(month) - 1, // Month is 0-indexed
        parseInt(day),
        hours || 0,
        minutes || 0,
        seconds || 0
      )

      if (!sessions.has(prefix)) {
        sessions.set(prefix, {
          id: displayId,
          fullId,
          org,
          device,
          year,
          month,
          day,
          time,
          prefix,
          timestamp: sessionTimestamp,
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

      const session = sessions.get(prefix)!
      const fileType = getFileType(obj.Key)

      session.files.push({
        key: obj.Key,
        size: obj.Size,
        lastModified: obj.LastModified,
        type: fileType,
      })

      session.totalSize += obj.Size

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

export async function getSessionMetadata(org: string, device: string, fullId: string): Promise<SessionMetadata> {
  try {
    const prefix = await findSessionPrefix(org, device, fullId)
    if (!prefix) return { ...DEFAULT_METADATA }

    const buffer = await getFileBuffer(`${prefix}/metadata.json`)
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
  org: string,
  device: string,
  fullId: string,
  updates: Partial<SessionMetadata>
): Promise<SessionMetadata> {
  // Find the session prefix
  const prefix = await findSessionPrefix(org, device, fullId)
  if (!prefix) {
    throw new Error('Session not found')
  }

  // Get existing metadata first
  const existing = await getSessionMetadata(org, device, fullId)
  const updated = { ...existing, ...updates }

  // Save to S3
  await uploadFile(
    `${prefix}/metadata.json`,
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

export async function getSessionNotes(org: string, device: string, fullId: string): Promise<Note[]> {
  try {
    const prefix = await findSessionPrefix(org, device, fullId)
    if (!prefix) return []

    const buffer = await getFileBuffer(`${prefix}/notes.json`)
    const data = JSON.parse(buffer.toString('utf-8'))
    return Array.isArray(data) ? data : []
  } catch {
    // File doesn't exist or invalid JSON - return empty array
    return []
  }
}

export async function saveSessionNotes(org: string, device: string, fullId: string, notes: Note[]): Promise<void> {
  const prefix = await findSessionPrefix(org, device, fullId)
  if (!prefix) {
    throw new Error('Session not found')
  }
  await uploadFile(
    `${prefix}/notes.json`,
    JSON.stringify(notes, null, 2),
    'application/json'
  )
}

export async function addNote(org: string, device: string, fullId: string, note: Omit<Note, 'id' | 'createdAt'>): Promise<Note> {
  const notes = await getSessionNotes(org, device, fullId)
  const newNote: Note = {
    ...note,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
  }
  notes.push(newNote)
  await saveSessionNotes(org, device, fullId, notes)
  return newNote
}

export async function updateNote(org: string, device: string, fullId: string, noteId: string, updates: Partial<Pick<Note, 'content' | 'timestamp' | 'resource'>>): Promise<Note | null> {
  const notes = await getSessionNotes(org, device, fullId)
  const index = notes.findIndex(n => n.id === noteId)
  if (index === -1) return null

  notes[index] = { ...notes[index], ...updates }
  await saveSessionNotes(org, device, fullId, notes)
  return notes[index]
}

export async function deleteNote(org: string, device: string, fullId: string, noteId: string): Promise<boolean> {
  const notes = await getSessionNotes(org, device, fullId)
  const index = notes.findIndex(n => n.id === noteId)
  if (index === -1) return false

  notes.splice(index, 1)
  await saveSessionNotes(org, device, fullId, notes)
  return true
}
