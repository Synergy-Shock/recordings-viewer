/**
 * Migration script to reorganize S3/R2 session files from flat structure to date-based prefixes.
 *
 * Before: {session_id}/screen/video.mp4
 * After:  yyyy/mm/dd/{session_id}/screen/video.mp4
 *
 * The date is determined from the earliest file's lastModified timestamp in each session.
 *
 * Usage:
 *   npx tsx scripts/migrate-to-date-prefixes.ts --dry-run    # Preview changes
 *   npx tsx scripts/migrate-to-date-prefixes.ts              # Execute migration
 *
 * Required environment variables:
 *   S3_ENDPOINT, S3_ACCESS_KEY, S3_SECRET_KEY, S3_BUCKET, S3_REGION
 */

import {
  S3Client,
  ListObjectsV2Command,
  CopyObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3'

// Configuration
const s3Client = new S3Client({
  region: process.env.S3_REGION || 'auto',
  endpoint: process.env.S3_ENDPOINT,
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY || '',
    secretAccessKey: process.env.S3_SECRET_KEY || '',
  },
})

const BUCKET = process.env.S3_BUCKET || 'recordings'
const DRY_RUN = process.argv.includes('--dry-run')

interface SessionInfo {
  id: string
  earliestDate: Date
  files: { key: string; size: number }[]
}

// Check if a key already has date prefix (yyyy/mm/dd/)
function hasDatePrefix(key: string): boolean {
  return /^\d{4}\/\d{2}\/\d{2}\//.test(key)
}

// Format date as yyyy/mm/dd
function formatDatePrefix(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}/${month}/${day}`
}

// List all objects and group by session
async function listAllSessions(): Promise<SessionInfo[]> {
  const sessions = new Map<string, SessionInfo>()
  let continuationToken: string | undefined

  console.log('Listing all objects in bucket...')

  do {
    const command = new ListObjectsV2Command({
      Bucket: BUCKET,
      ContinuationToken: continuationToken,
    })

    const response = await s3Client.send(command)

    for (const obj of response.Contents || []) {
      if (!obj.Key || !obj.LastModified) continue

      // Skip if already has date prefix
      if (hasDatePrefix(obj.Key)) {
        console.log(`  Skipping (already migrated): ${obj.Key}`)
        continue
      }

      // Extract session ID (first part of the key path)
      const parts = obj.Key.split('/')
      if (parts.length < 2) continue

      const sessionId = parts[0]

      if (!sessions.has(sessionId)) {
        sessions.set(sessionId, {
          id: sessionId,
          earliestDate: obj.LastModified,
          files: [],
        })
      }

      const session = sessions.get(sessionId)!
      session.files.push({ key: obj.Key, size: obj.Size || 0 })

      // Track earliest date for this session
      if (obj.LastModified < session.earliestDate) {
        session.earliestDate = obj.LastModified
      }
    }

    continuationToken = response.NextContinuationToken
  } while (continuationToken)

  return Array.from(sessions.values())
}

// Move a single file to new location
async function moveFile(oldKey: string, newKey: string): Promise<void> {
  if (DRY_RUN) {
    console.log(`  [DRY RUN] Would move: ${oldKey} -> ${newKey}`)
    return
  }

  // Copy to new location
  await s3Client.send(
    new CopyObjectCommand({
      Bucket: BUCKET,
      CopySource: `${BUCKET}/${encodeURIComponent(oldKey)}`,
      Key: newKey,
    })
  )

  // Delete from old location
  await s3Client.send(
    new DeleteObjectCommand({
      Bucket: BUCKET,
      Key: oldKey,
    })
  )

  console.log(`  Moved: ${oldKey} -> ${newKey}`)
}

// Migrate a single session
async function migrateSession(session: SessionInfo): Promise<void> {
  const datePrefix = formatDatePrefix(session.earliestDate)
  console.log(`\nMigrating session ${session.id} (${session.files.length} files) to ${datePrefix}/`)

  for (const file of session.files) {
    // Build new key: yyyy/mm/dd/session_id/rest/of/path
    const pathWithoutSessionId = file.key.substring(session.id.length + 1) // +1 for the /
    const newKey = `${datePrefix}/${session.id}/${pathWithoutSessionId}`

    await moveFile(file.key, newKey)
  }
}

// Main migration function
async function migrate(): Promise<void> {
  console.log('='.repeat(60))
  console.log('S3/R2 Session Migration: Flat -> Date-Prefixed Structure')
  console.log('='.repeat(60))
  console.log(`Bucket: ${BUCKET}`)
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN (no changes will be made)' : 'LIVE (files will be moved)'}`)
  console.log('')

  if (!process.env.S3_ACCESS_KEY || !process.env.S3_SECRET_KEY) {
    console.error('Error: Missing S3 credentials. Set S3_ACCESS_KEY and S3_SECRET_KEY.')
    process.exit(1)
  }

  const sessions = await listAllSessions()

  if (sessions.length === 0) {
    console.log('\nNo sessions found that need migration.')
    return
  }

  console.log(`\nFound ${sessions.length} sessions to migrate:`)

  // Show summary
  let totalFiles = 0
  let totalSize = 0
  for (const session of sessions) {
    const sessionSize = session.files.reduce((sum, f) => sum + f.size, 0)
    totalFiles += session.files.length
    totalSize += sessionSize
    console.log(`  ${session.id} -> ${formatDatePrefix(session.earliestDate)}/ (${session.files.length} files, ${(sessionSize / 1024 / 1024).toFixed(1)} MB)`)
  }

  console.log(`\nTotal: ${totalFiles} files, ${(totalSize / 1024 / 1024 / 1024).toFixed(2)} GB`)

  if (!DRY_RUN) {
    console.log('\nStarting migration in 5 seconds... (Ctrl+C to cancel)')
    await new Promise(resolve => setTimeout(resolve, 5000))
  }

  // Migrate each session
  let migratedSessions = 0
  let migratedFiles = 0
  let errors: string[] = []

  for (const session of sessions) {
    try {
      await migrateSession(session)
      migratedSessions++
      migratedFiles += session.files.length
    } catch (err) {
      const errorMsg = `Failed to migrate ${session.id}: ${err}`
      console.error(`  ERROR: ${errorMsg}`)
      errors.push(errorMsg)
    }
  }

  // Summary
  console.log('\n' + '='.repeat(60))
  console.log('Migration Complete')
  console.log('='.repeat(60))
  console.log(`Sessions migrated: ${migratedSessions}/${sessions.length}`)
  console.log(`Files migrated: ${migratedFiles}/${totalFiles}`)

  if (errors.length > 0) {
    console.log(`\nErrors (${errors.length}):`)
    errors.forEach(e => console.log(`  - ${e}`))
  }

  if (DRY_RUN) {
    console.log('\n[DRY RUN] No files were actually moved. Run without --dry-run to execute.')
  }
}

// Run migration
migrate().catch(err => {
  console.error('Migration failed:', err)
  process.exit(1)
})
