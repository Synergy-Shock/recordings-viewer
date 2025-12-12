import { S3Client, ListObjectsV2Command, HeadObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { GetObjectCommand } from '@aws-sdk/client-s3'

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
  type: 'screen-video' | 'screen-audio' | 'camera-video' | 'audio-raw' | 'audio-clean' | 'unknown'
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
  totalSize: number
}

function getFileType(key: string): SessionFile['type'] {
  if (key.includes('screen/video')) return 'screen-video'
  if (key.includes('screen/audio')) return 'screen-audio'
  if (key.includes('camera/video')) return 'camera-video'
  if (key.includes('audio/raw')) return 'audio-raw'
  if (key.includes('audio/clean')) return 'audio-clean'
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
          totalSize: 0,
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
      }
    }

    continuationToken = response.NextContinuationToken
  } while (continuationToken)

  // Sort by timestamp descending (newest first)
  return Array.from(sessions.values()).sort(
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
