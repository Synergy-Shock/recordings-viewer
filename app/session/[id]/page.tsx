'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { use } from 'react'

interface SessionFile {
  key: string
  size: number
  lastModified: string
  type: string
}

interface SessionMetadata {
  favorite: boolean
  score: number | null
}

interface Session {
  id: string
  timestamp: string
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
  metadata?: SessionMetadata
}

interface MediaUrls {
  screenVideo?: string
  screenAudio?: string
  cameraVideo?: string
  audioRaw?: string
  audioClean?: string
}

interface MediaKeys {
  screenAudio?: string
  audioRaw?: string
  audioClean?: string
}

type NoteResource = 'global' | 'screen-video' | 'screen-audio' | 'camera-video' | 'audio-raw' | 'audio-clean'

interface Note {
  id: string
  timestamp: number
  resource: NoteResource
  content: string
  createdAt: string
}

interface VttUrls {
  screenAudio?: string
  audioRaw?: string
  audioClean?: string
}

interface FileDuration {
  key: string
  type: string
  duration: number | null
  loading: boolean
  error?: string
}

interface WaveformData {
  peaks: number[]
  duration: number
}

interface AudioStats {
  peakDb: number
  rmsDb: number
  dynamicRange: number
  silencePercent: number
  clipping: boolean
  sampleRate: number
  channels: number
}

interface SubtitleCue {
  start: number
  end: number
  text: string
}

interface TranscriptionState {
  screenAudio: { loading: boolean; cues: SubtitleCue[] }
  audioRaw: { loading: boolean; cues: SubtitleCue[] }
  audioClean: { loading: boolean; cues: SubtitleCue[] }
}

// Parse WebVTT content into cues
function parseVtt(vttContent: string): SubtitleCue[] {
  const cues: SubtitleCue[] = []
  const lines = vttContent.split('\n')
  let i = 0

  // Skip header
  while (i < lines.length && !lines[i].includes('-->')) {
    i++
  }

  while (i < lines.length) {
    const line = lines[i].trim()

    if (line.includes('-->')) {
      const [startStr, endStr] = line.split('-->').map(s => s.trim())
      const start = parseVttTimestamp(startStr)
      const end = parseVttTimestamp(endStr)

      // Collect text lines until empty line or next timestamp
      const textLines: string[] = []
      i++
      while (i < lines.length && lines[i].trim() && !lines[i].includes('-->')) {
        // Skip numeric cue identifiers
        if (!/^\d+$/.test(lines[i].trim())) {
          textLines.push(lines[i].trim())
        }
        i++
      }

      if (textLines.length > 0) {
        cues.push({ start, end, text: textLines.join(' ') })
      }
    } else {
      i++
    }
  }

  return cues
}

function parseVttTimestamp(timestamp: string): number {
  const parts = timestamp.split(':')
  const [seconds, ms] = parts[parts.length - 1].split('.')
  let totalSeconds = parseFloat(seconds) + (ms ? parseFloat(`0.${ms}`) : 0)

  if (parts.length >= 2) {
    totalSeconds += parseInt(parts[parts.length - 2]) * 60
  }
  if (parts.length >= 3) {
    totalSeconds += parseInt(parts[parts.length - 3]) * 3600
  }

  return totalSeconds
}

// Convert linear amplitude to decibels
function toDb(value: number): number {
  if (value <= 0) return -Infinity
  return 20 * Math.log10(value)
}

function AudioWaveformWithStats({
  fileKey,
  label,
  currentTime,
  duration: totalDuration,
  onSeek,
  color = '#10b981',
  compact = false,
}: {
  fileKey: string
  label: string
  currentTime: number
  duration: number
  onSeek: (time: number) => void
  color?: string
  compact?: boolean
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [waveformData, setWaveformData] = useState<WaveformData | null>(null)
  const [audioStats, setAudioStats] = useState<AudioStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Load and analyze audio via proxy (bypasses CORS)
  useEffect(() => {
    if (!fileKey) return

    const audioContext = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()

    setLoading(true)
    setError(null)

    // Use proxy endpoint to bypass CORS
    const proxyUrl = `/api/proxy?key=${encodeURIComponent(fileKey)}`

    fetch(proxyUrl)
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.arrayBuffer()
      })
      .then(buffer => audioContext.decodeAudioData(buffer))
      .then(audioBuffer => {
        const rawData = audioBuffer.getChannelData(0)
        const samples = 200 // Number of bars in waveform
        const blockSize = Math.floor(rawData.length / samples)
        const peaks: number[] = []

        // Calculate waveform peaks
        for (let i = 0; i < samples; i++) {
          let sum = 0
          for (let j = 0; j < blockSize; j++) {
            sum += Math.abs(rawData[i * blockSize + j])
          }
          peaks.push(sum / blockSize)
        }

        // Calculate audio statistics
        let peak = 0
        let sumSquares = 0
        let silentSamples = 0
        let clippingSamples = 0
        const silenceThreshold = 0.01 // -40dB roughly

        for (let i = 0; i < rawData.length; i++) {
          const absValue = Math.abs(rawData[i])
          if (absValue > peak) peak = absValue
          sumSquares += rawData[i] * rawData[i]
          if (absValue < silenceThreshold) silentSamples++
          if (absValue >= 0.99) clippingSamples++
        }

        const rms = Math.sqrt(sumSquares / rawData.length)
        const peakDb = toDb(peak)
        const rmsDb = toDb(rms)

        const stats: AudioStats = {
          peakDb: isFinite(peakDb) ? peakDb : -60,
          rmsDb: isFinite(rmsDb) ? rmsDb : -60,
          dynamicRange: isFinite(peakDb) && isFinite(rmsDb) ? peakDb - rmsDb : 0,
          silencePercent: (silentSamples / rawData.length) * 100,
          clipping: clippingSamples > 100,
          sampleRate: audioBuffer.sampleRate,
          channels: audioBuffer.numberOfChannels,
        }

        // Normalize peaks
        const maxPeak = Math.max(...peaks)
        const normalizedPeaks = peaks.map(p => p / maxPeak)

        setWaveformData({ peaks: normalizedPeaks, duration: audioBuffer.duration })
        setAudioStats(stats)
        setLoading(false)
        audioContext.close()
      })
      .catch(err => {
        console.error('Waveform load error:', err)
        setError('Failed to load')
        setLoading(false)
        audioContext.close()
      })
  }, [fileKey])

  // Draw waveform
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !waveformData) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const { peaks } = waveformData
    const width = canvas.width
    const height = canvas.height
    const barWidth = width / peaks.length
    const playheadPosition = totalDuration > 0 ? (currentTime / totalDuration) * width : 0

    // Clear canvas
    ctx.fillStyle = '#18181b'
    ctx.fillRect(0, 0, width, height)

    // Draw bars
    peaks.forEach((peak, i) => {
      const x = i * barWidth
      const barHeight = peak * height * 0.85
      const y = (height - barHeight) / 2

      // Color bars based on playhead position
      ctx.fillStyle = x < playheadPosition ? color : '#3f3f46'
      ctx.fillRect(x, y, barWidth - 1, barHeight)
    })

    // Draw playhead
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(playheadPosition - 1, 0, 2, height)
  }, [waveformData, currentTime, totalDuration, color])

  // Handle click to seek
  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas || !totalDuration) return

    const rect = canvas.getBoundingClientRect()
    const x = e.clientX - rect.left
    const seekTime = (x / rect.width) * totalDuration
    onSeek(seekTime)
  }

  return (
    <div className={compact ? '' : 'bg-zinc-800/50 rounded-lg p-3'}>
      {(label || (!compact && audioStats)) && (
        <div className="flex items-center justify-between mb-2">
          <div className="text-xs text-zinc-400 font-medium">{label}</div>
          {audioStats && !compact && (
            <div className="flex items-center gap-3 text-[10px]">
              {audioStats.clipping && (
                <span className="text-red-400 font-medium">CLIPPING</span>
              )}
              <span className="text-zinc-500">
                {audioStats.sampleRate / 1000}kHz {audioStats.channels}ch
              </span>
            </div>
          )}
        </div>
      )}
      {loading ? (
        <div className={`${compact ? 'h-10' : 'h-14'} flex items-center justify-center text-xs text-zinc-500`}>
          Loading waveform...
        </div>
      ) : error ? (
        <div className={`${compact ? 'h-10' : 'h-14'} flex items-center justify-center text-xs text-red-400`}>
          {error}
        </div>
      ) : (
        <>
          <canvas
            ref={canvasRef}
            width={600}
            height={compact ? 40 : 56}
            onClick={handleClick}
            className={`w-full ${compact ? 'h-10' : 'h-14'} rounded cursor-pointer`}
          />
          {audioStats && compact && (
            <div className="mt-1.5 flex items-center gap-3 text-[10px] text-zinc-500">
              <span>
                Peak: <span className={`font-mono ${audioStats.peakDb > -3 ? 'text-red-400' : audioStats.peakDb > -6 ? 'text-amber-400' : 'text-zinc-400'}`}>{audioStats.peakDb.toFixed(1)}dB</span>
              </span>
              <span>
                RMS: <span className="font-mono text-zinc-400">{audioStats.rmsDb.toFixed(1)}dB</span>
              </span>
              <span>
                Silence: <span className={`font-mono ${audioStats.silencePercent > 50 ? 'text-amber-400' : 'text-zinc-400'}`}>{audioStats.silencePercent.toFixed(0)}%</span>
              </span>
              {audioStats.clipping && <span className="text-red-400 font-medium">CLIPPING</span>}
            </div>
          )}
          {audioStats && !compact && (
            <div className="mt-2 grid grid-cols-4 gap-2 text-[10px]">
              <div className="bg-zinc-900 rounded px-2 py-1">
                <div className="text-zinc-500">Peak</div>
                <div className={`font-mono ${audioStats.peakDb > -3 ? 'text-red-400' : audioStats.peakDb > -6 ? 'text-amber-400' : 'text-zinc-300'}`}>
                  {audioStats.peakDb.toFixed(1)} dB
                </div>
              </div>
              <div className="bg-zinc-900 rounded px-2 py-1">
                <div className="text-zinc-500">RMS</div>
                <div className="font-mono text-zinc-300">{audioStats.rmsDb.toFixed(1)} dB</div>
              </div>
              <div className="bg-zinc-900 rounded px-2 py-1">
                <div className="text-zinc-500">Dynamic Range</div>
                <div className="font-mono text-zinc-300">{audioStats.dynamicRange.toFixed(1)} dB</div>
              </div>
              <div className="bg-zinc-900 rounded px-2 py-1">
                <div className="text-zinc-500">Silence</div>
                <div className={`font-mono ${audioStats.silencePercent > 50 ? 'text-amber-400' : 'text-zinc-300'}`}>
                  {audioStats.silencePercent.toFixed(0)}%
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function AudioComparison({
  cleanKey,
  rawKey,
  cleanUrl,
  rawUrl,
  currentTime,
  duration,
  onSeek,
  audioSource,
  setAudioSource,
  onAddNote,
}: {
  cleanKey?: string
  rawKey?: string
  cleanUrl?: string
  rawUrl?: string
  currentTime: number
  duration: number
  onSeek: (time: number) => void
  audioSource: 'clean' | 'raw'
  setAudioSource: (source: 'clean' | 'raw') => void
  onAddNote?: (resource: NoteResource) => void
}) {
  const cleanAudioRef = useRef<HTMLAudioElement>(null)
  const rawAudioRef = useRef<HTMLAudioElement>(null)
  const [soloPlaying, setSoloPlaying] = useState<'clean' | 'raw' | null>(null)
  const [soloTime, setSoloTime] = useState(0)

  // Handle solo play/pause
  const toggleSolo = (track: 'clean' | 'raw') => {
    const audioRef = track === 'clean' ? cleanAudioRef : rawAudioRef
    const otherRef = track === 'clean' ? rawAudioRef : cleanAudioRef

    if (soloPlaying === track) {
      // Pause current
      audioRef.current?.pause()
      setSoloPlaying(null)
    } else {
      // Stop other and play this one
      otherRef.current?.pause()
      if (audioRef.current) {
        audioRef.current.currentTime = currentTime
        audioRef.current.play()
      }
      setSoloPlaying(track)
    }
  }

  // Sync time display
  const handleTimeUpdate = (track: 'clean' | 'raw') => {
    const audioRef = track === 'clean' ? cleanAudioRef : rawAudioRef
    if (audioRef.current && soloPlaying === track) {
      setSoloTime(audioRef.current.currentTime)
    }
  }

  // Handle audio end
  const handleEnded = () => {
    setSoloPlaying(null)
  }

  // Seek and play - clicking on waveform seeks to that position and starts playing
  const handleSeekAndPlay = (track: 'clean' | 'raw', time: number) => {
    const audioRef = track === 'clean' ? cleanAudioRef : rawAudioRef
    const otherRef = track === 'clean' ? rawAudioRef : cleanAudioRef

    // Stop the other track
    otherRef.current?.pause()

    // Seek and play this track
    if (audioRef.current) {
      audioRef.current.currentTime = time
      audioRef.current.play()
    }

    setSoloPlaying(track)
    setSoloTime(time)
    onSeek(time)
  }

  if (!cleanKey && !rawKey) return null

  const displayTime = soloPlaying ? soloTime : currentTime

  return (
    <div className="bg-zinc-900 rounded-lg p-4 border border-zinc-800">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium">Mic Audio Comparison</h3>
        <div className="flex items-center gap-3">
          {soloPlaying && (
            <span className="text-xs text-amber-400 flex items-center gap-1">
              <span className="w-2 h-2 bg-amber-400 rounded-full animate-pulse" />
              Solo
            </span>
          )}
          {/* Audio source toggle for main replay */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-zinc-500">Replay:</span>
            <div className="flex rounded overflow-hidden border border-zinc-700">
              <button
                onClick={() => setAudioSource('clean')}
                className={`px-2 py-0.5 text-xs ${
                  audioSource === 'clean'
                    ? 'bg-emerald-600 text-white'
                    : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                }`}
              >
                Clean
              </button>
              <button
                onClick={() => setAudioSource('raw')}
                className={`px-2 py-0.5 text-xs ${
                  audioSource === 'raw'
                    ? 'bg-amber-600 text-white'
                    : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                }`}
              >
                Raw
              </button>
            </div>
          </div>
        </div>
      </div>
      <div className="space-y-3">
        {cleanKey && (
          <div className="bg-zinc-800/50 rounded-lg p-3">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                {cleanUrl && (
                  <button
                    onClick={() => toggleSolo('clean')}
                    className={`p-1.5 rounded-full transition-colors ${
                      soloPlaying === 'clean'
                        ? 'bg-emerald-500 text-white'
                        : 'bg-zinc-700 text-zinc-300 hover:bg-zinc-600'
                    }`}
                    title={soloPlaying === 'clean' ? 'Stop' : 'Play clean audio'}
                  >
                    {soloPlaying === 'clean' ? (
                      <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
                      </svg>
                    ) : (
                      <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M8 5v14l11-7z" />
                      </svg>
                    )}
                  </button>
                )}
                <span className="text-xs text-zinc-400 font-medium">Clean (Noise Reduced)</span>
              </div>
              {onAddNote && (
                <button
                  onClick={() => onAddNote('audio-clean')}
                  className="p-1 rounded bg-zinc-700 text-zinc-400 hover:text-white hover:bg-zinc-600 transition-colors"
                  title="Add note"
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                </button>
              )}
            </div>
            <AudioWaveformWithStats
              fileKey={cleanKey}
              label=""
              currentTime={displayTime}
              duration={duration}
              onSeek={(time) => handleSeekAndPlay('clean', time)}
              color="#10b981"
            />
          </div>
        )}
        {rawKey && (
          <div className="bg-zinc-800/50 rounded-lg p-3">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                {rawUrl && (
                  <button
                    onClick={() => toggleSolo('raw')}
                    className={`p-1.5 rounded-full transition-colors ${
                      soloPlaying === 'raw'
                        ? 'bg-amber-500 text-white'
                        : 'bg-zinc-700 text-zinc-300 hover:bg-zinc-600'
                    }`}
                    title={soloPlaying === 'raw' ? 'Stop' : 'Play raw audio'}
                  >
                    {soloPlaying === 'raw' ? (
                      <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
                      </svg>
                    ) : (
                      <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M8 5v14l11-7z" />
                      </svg>
                    )}
                  </button>
                )}
                <span className="text-xs text-zinc-400 font-medium">Raw (Original)</span>
              </div>
              {onAddNote && (
                <button
                  onClick={() => onAddNote('audio-raw')}
                  className="p-1 rounded bg-zinc-700 text-zinc-400 hover:text-white hover:bg-zinc-600 transition-colors"
                  title="Add note"
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                </button>
              )}
            </div>
            <AudioWaveformWithStats
              fileKey={rawKey}
              label=""
              currentTime={displayTime}
              duration={duration}
              onSeek={(time) => handleSeekAndPlay('raw', time)}
              color="#f59e0b"
            />
          </div>
        )}
      </div>
      {cleanKey && rawKey && (
        <div className="mt-3 pt-3 border-t border-zinc-800 text-xs text-zinc-500">
          Click on waveform to seek and play. Compare to hear noise reduction effect.
        </div>
      )}
      {/* Hidden audio elements for solo playback */}
      {cleanUrl && (
        <audio
          ref={cleanAudioRef}
          src={cleanUrl}
          onTimeUpdate={() => handleTimeUpdate('clean')}
          onEnded={handleEnded}
          preload="auto"
        />
      )}
      {rawUrl && (
        <audio
          ref={rawAudioRef}
          src={rawUrl}
          onTimeUpdate={() => handleTimeUpdate('raw')}
          onEnded={handleEnded}
          preload="auto"
        />
      )}
    </div>
  )
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

export default function SessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [mediaUrls, setMediaUrls] = useState<MediaUrls>({})
  const [mediaKeys, setMediaKeys] = useState<MediaKeys>({})
  const [vttUrls, setVttUrls] = useState<VttUrls>({})
  const [audioSource, setAudioSource] = useState<'raw' | 'clean'>('clean')
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [showCamera, setShowCamera] = useState(true)
  const [playbackSpeed, setPlaybackSpeed] = useState(1)
  const [screenVolume, setScreenVolume] = useState(0.5)
  const [micVolume, setMicVolume] = useState(1)

  // Delete confirmation state
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleteConfirmText, setDeleteConfirmText] = useState('')
  const [isDeleting, setIsDeleting] = useState(false)

  // Transcription state
  const [transcriptions, setTranscriptions] = useState<TranscriptionState>({
    screenAudio: { loading: false, cues: [] },
    audioRaw: { loading: false, cues: [] },
    audioClean: { loading: false, cues: [] },
  })

  const screenVideoRef = useRef<HTMLVideoElement>(null)
  const cameraVideoRef = useRef<HTMLVideoElement>(null)
  const screenAudioRef = useRef<HTMLAudioElement>(null)
  const micAudioRef = useRef<HTMLAudioElement>(null)
  const isSeeking = useRef(false)

  // Store presigned URLs for downloads
  const [fileUrls, setFileUrls] = useState<Record<string, string>>({})

  // Duration analysis
  const [fileDurations, setFileDurations] = useState<FileDuration[]>([])
  const [analyzingDurations, setAnalyzingDurations] = useState(false)

  // Notes state
  const [notes, setNotes] = useState<Note[]>([])
  const [showNoteInput, setShowNoteInput] = useState(false)
  const [noteInputResource, setNoteInputResource] = useState<NoteResource>('global')
  const [noteInputContent, setNoteInputContent] = useState('')
  const [noteInputTimestamp, setNoteInputTimestamp] = useState(0)
  const [editingNote, setEditingNote] = useState<Note | null>(null)
  const [savingNote, setSavingNote] = useState(false)

  // Fetch session data
  useEffect(() => {
    async function fetchSession() {
      try {
        const res = await fetch('/api/sessions')
        if (!res.ok) throw new Error('Failed to fetch sessions')
        const data = await res.json()
        const found = data.sessions.find((s: Session) => s.id === id)
        if (!found) throw new Error('Session not found')
        setSession(found)
      } catch (err) {
        setError(String(err))
      } finally {
        setLoading(false)
      }
    }
    fetchSession()
  }, [id])

  // Generate presigned URLs for media files
  useEffect(() => {
    if (!session) return

    const filesToLoad = [...session.files]

    async function getUrl(key: string): Promise<string> {
      const res = await fetch(`/api/presign?key=${encodeURIComponent(key)}`)
      const data = await res.json()
      return data.url
    }

    async function loadUrls() {
      const urls: MediaUrls = {}
      const keys: MediaKeys = {}
      const downloadUrls: Record<string, string> = {}
      const transcriptionFiles: { type: 'screenAudio' | 'audioRaw' | 'audioClean'; key: string }[] = []

      for (const file of filesToLoad) {
        try {
          const url = await getUrl(file.key)
          downloadUrls[file.key] = url
          switch (file.type) {
            case 'screen-video':
              urls.screenVideo = url
              break
            case 'screen-audio':
              urls.screenAudio = url
              keys.screenAudio = file.key
              break
            case 'camera-video':
              urls.cameraVideo = url
              break
            case 'audio-raw':
              urls.audioRaw = url
              keys.audioRaw = file.key
              break
            case 'audio-clean':
              urls.audioClean = url
              keys.audioClean = file.key
              break
            case 'transcription-screen':
              transcriptionFiles.push({ type: 'screenAudio', key: file.key })
              break
            case 'transcription-raw':
              transcriptionFiles.push({ type: 'audioRaw', key: file.key })
              break
            case 'transcription-clean':
              transcriptionFiles.push({ type: 'audioClean', key: file.key })
              break
          }
        } catch (err) {
          console.error(`Failed to get URL for ${file.key}:`, err)
        }
      }

      setMediaUrls(urls)
      setMediaKeys(keys)
      setFileUrls(downloadUrls)

      // Load existing transcriptions - store VTT URLs for native track elements
      const vttUrlsObj: VttUrls = {}
      const cacheBuster = Date.now()
      for (const { type, key } of transcriptionFiles) {
        try {
          // Add cache-busting timestamp to ensure fresh content
          const proxyUrl = `/api/proxy?key=${encodeURIComponent(key)}&t=${cacheBuster}`
          // Store the URL for native track element
          vttUrlsObj[type] = proxyUrl

          // Also load cues for the transcript box - force no-cache
          const res = await fetch(proxyUrl, { cache: 'no-store' })
          if (res.ok) {
            const vttContent = await res.text()
            const cues = parseVtt(vttContent)
            setTranscriptions(prev => ({
              ...prev,
              [type]: { loading: false, cues },
            }))
          }
        } catch (err) {
          console.error(`Failed to load transcription ${key}:`, err)
        }
      }
      setVttUrls(vttUrlsObj)
    }

    loadUrls()
  }, [session])

  // Analyze durations of all media files
  useEffect(() => {
    if (Object.keys(fileUrls).length === 0 || !session) return

    setAnalyzingDurations(true)

    // Initialize durations state - exclude transcription files (VTT)
    const isMediaFile = (type: string) => !type.startsWith('transcription-') && type !== 'unknown'
    const initialDurations: FileDuration[] = session.files
      .filter(f => isMediaFile(f.type))
      .map(f => ({
        key: f.key,
        type: f.type,
        duration: null,
        loading: true,
      }))
    setFileDurations(initialDurations)

    // Analyze each file
    session.files.forEach((file) => {
      const url = fileUrls[file.key]
      if (!url || !isMediaFile(file.type)) return

      const isVideo = file.type.includes('video')
      const element = isVideo
        ? document.createElement('video')
        : document.createElement('audio')

      element.preload = 'metadata'

      element.onloadedmetadata = () => {
        setFileDurations(prev =>
          prev.map(d =>
            d.key === file.key
              ? { ...d, duration: element.duration, loading: false }
              : d
          )
        )
        element.remove()
      }

      element.onerror = () => {
        setFileDurations(prev =>
          prev.map(d =>
            d.key === file.key
              ? { ...d, loading: false, error: 'Failed to load' }
              : d
          )
        )
        element.remove()
      }

      element.src = url
    })

    // Mark analysis complete after a timeout (in case some files fail silently)
    const timeout = setTimeout(() => setAnalyzingDurations(false), 10000)
    return () => clearTimeout(timeout)
  }, [fileUrls, session])

  // Sync all media to the same time
  const syncAllMedia = useCallback((time: number) => {
    if (screenVideoRef.current) {
      screenVideoRef.current.currentTime = time
    }
    if (cameraVideoRef.current) {
      cameraVideoRef.current.currentTime = time
    }
    if (screenAudioRef.current) {
      screenAudioRef.current.currentTime = time
    }
    if (micAudioRef.current) {
      micAudioRef.current.currentTime = time
    }
  }, [])

  // Play/pause all media
  const togglePlayPause = useCallback(() => {
    const newIsPlaying = !isPlaying

    if (newIsPlaying) {
      screenVideoRef.current?.play()
      cameraVideoRef.current?.play()
      screenAudioRef.current?.play()
      micAudioRef.current?.play()
    } else {
      screenVideoRef.current?.pause()
      cameraVideoRef.current?.pause()
      screenAudioRef.current?.pause()
      micAudioRef.current?.pause()
    }

    setIsPlaying(newIsPlaying)
  }, [isPlaying])

  // Handle seek
  const handleSeek = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value)
    setCurrentTime(time)
    isSeeking.current = true
    syncAllMedia(time)
    setTimeout(() => {
      isSeeking.current = false
    }, 100)
  }, [syncAllMedia])

  // Time update handler
  const handleTimeUpdate = useCallback(() => {
    if (isSeeking.current) return
    if (screenVideoRef.current) {
      setCurrentTime(screenVideoRef.current.currentTime)
    }
  }, [])

  // Duration loaded handler
  const handleLoadedMetadata = useCallback(() => {
    if (screenVideoRef.current) {
      setDuration(screenVideoRef.current.duration)
    }
  }, [])

  // Handle video end
  const handleEnded = useCallback(() => {
    setIsPlaying(false)
  }, [])

  // Handle playback speed change
  const handleSpeedChange = useCallback((speed: number) => {
    setPlaybackSpeed(speed)
    if (screenVideoRef.current) screenVideoRef.current.playbackRate = speed
    if (cameraVideoRef.current) cameraVideoRef.current.playbackRate = speed
    if (screenAudioRef.current) screenAudioRef.current.playbackRate = speed
    if (micAudioRef.current) micAudioRef.current.playbackRate = speed
  }, [])

  // Handle screen audio volume change
  const handleScreenVolumeChange = useCallback((volume: number) => {
    setScreenVolume(volume)
    if (screenAudioRef.current) screenAudioRef.current.volume = volume
  }, [])

  // Handle mic volume change
  const handleMicVolumeChange = useCallback((volume: number) => {
    setMicVolume(volume)
    if (micAudioRef.current) micAudioRef.current.volume = volume
  }, [])

  // Get current mic audio URL and key based on selection
  const currentMicAudioUrl = audioSource === 'clean' ? mediaUrls.audioClean : mediaUrls.audioRaw
  const currentMicAudioKey = audioSource === 'clean' ? mediaKeys.audioClean : mediaKeys.audioRaw

  // Set initial volumes when audio elements are ready
  useEffect(() => {
    if (screenAudioRef.current) {
      screenAudioRef.current.volume = screenVolume
      screenAudioRef.current.playbackRate = playbackSpeed
    }
  }, [mediaUrls.screenAudio, screenVolume, playbackSpeed])

  useEffect(() => {
    if (micAudioRef.current) {
      micAudioRef.current.volume = micVolume
      micAudioRef.current.playbackRate = playbackSpeed
    }
  }, [currentMicAudioUrl, micVolume, playbackSpeed])

  // Handle waveform seek
  const handleWaveformSeek = useCallback((time: number) => {
    setCurrentTime(time)
    syncAllMedia(time)
  }, [syncAllMedia])

  // Enable subtitle tracks when VTT URLs change
  useEffect(() => {
    const video = screenVideoRef.current
    if (!video) return

    // Wait a bit for tracks to load
    const timer = setTimeout(() => {
      const tracks = video.textTracks
      for (let i = 0; i < tracks.length; i++) {
        const track = tracks[i]
        // Enable both screen audio and mic audio tracks
        if (track.label === 'Screen Audio (System)' ||
            track.label === 'Mic Audio (Clean)' ||
            track.label === 'Mic Audio (Raw)') {
          track.mode = 'showing'
        }
      }
    }, 100)

    return () => clearTimeout(timer)
  }, [vttUrls.screenAudio, vttUrls.audioClean, vttUrls.audioRaw])

  // Keyboard controls
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.code === 'Space') {
        e.preventDefault()
        togglePlayPause()
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault()
        const newTime = Math.max(0, currentTime - 5)
        setCurrentTime(newTime)
        syncAllMedia(newTime)
      } else if (e.code === 'ArrowRight') {
        e.preventDefault()
        const newTime = Math.min(duration, currentTime + 5)
        setCurrentTime(newTime)
        syncAllMedia(newTime)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [togglePlayPause, currentTime, duration, syncAllMedia])

  // Handle delete session
  const handleDelete = useCallback(async () => {
    if (deleteConfirmText !== id) return

    setIsDeleting(true)
    try {
      const res = await fetch(`/api/sessions/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to delete')
      }
      router.push('/')
    } catch (err) {
      setError(String(err))
      setIsDeleting(false)
      setShowDeleteConfirm(false)
    }
  }, [deleteConfirmText, id, router])

  // Generate transcription for an audio type
  const generateTranscription = useCallback(async (audioType: 'screen-audio' | 'audio-raw' | 'audio-clean') => {
    const stateKey = audioType === 'screen-audio' ? 'screenAudio' : audioType === 'audio-raw' ? 'audioRaw' : 'audioClean'

    setTranscriptions(prev => ({
      ...prev,
      [stateKey]: { ...prev[stateKey], loading: true },
    }))

    try {
      const res = await fetch('/api/transcribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: id, audioType }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Transcription failed')
      }

      const data = await res.json()

      // Fetch the newly created VTT file with cache-busting
      const vttKey = data.vttKey
      const proxyUrl = `/api/proxy?key=${encodeURIComponent(vttKey)}&t=${Date.now()}`

      // Update VTT URL for native track element
      setVttUrls(prev => ({ ...prev, [stateKey]: proxyUrl }))

      const vttRes = await fetch(proxyUrl, { cache: 'no-store' })
      const vttContent = await vttRes.text()
      const cues = parseVtt(vttContent)

      setTranscriptions(prev => ({
        ...prev,
        [stateKey]: { loading: false, cues },
      }))

      // Update session to reflect new transcription file
      if (session) {
        const newSession = { ...session }
        if (audioType === 'screen-audio') newSession.hasTranscriptionScreen = true
        if (audioType === 'audio-raw') newSession.hasTranscriptionRaw = true
        if (audioType === 'audio-clean') newSession.hasTranscriptionClean = true
        setSession(newSession)
      }
    } catch (err) {
      console.error('Transcription error:', err)
      setTranscriptions(prev => ({
        ...prev,
        [stateKey]: { loading: false, cues: [] },
      }))
      alert(`Transcription failed: ${err instanceof Error ? err.message : 'Unknown error'}`)
    }
  }, [id, session])

  // Fetch notes
  useEffect(() => {
    if (!id) return
    fetch(`/api/sessions/${id}/notes`)
      .then(res => res.json())
      .then(data => setNotes(data.notes || []))
      .catch(err => console.error('Failed to fetch notes:', err))
  }, [id])

  // Open note input modal
  const openNoteInput = useCallback((resource: NoteResource) => {
    setNoteInputResource(resource)
    setNoteInputTimestamp(currentTime)
    setNoteInputContent('')
    setEditingNote(null)
    setShowNoteInput(true)
  }, [currentTime])

  // Open note for editing
  const openNoteEdit = useCallback((note: Note) => {
    setNoteInputResource(note.resource)
    setNoteInputTimestamp(note.timestamp)
    setNoteInputContent(note.content)
    setEditingNote(note)
    setShowNoteInput(true)
  }, [])

  // Save note (add or update)
  const saveNote = useCallback(async () => {
    if (!noteInputContent.trim()) return

    setSavingNote(true)
    try {
      if (editingNote) {
        // Update existing note
        const res = await fetch(`/api/sessions/${id}/notes`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            noteId: editingNote.id,
            content: noteInputContent,
            timestamp: noteInputTimestamp,
            resource: noteInputResource,
          }),
        })
        if (res.ok) {
          const data = await res.json()
          setNotes(prev => prev.map(n => n.id === editingNote.id ? data.note : n))
        }
      } else {
        // Add new note
        const res = await fetch(`/api/sessions/${id}/notes`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            content: noteInputContent,
            timestamp: noteInputTimestamp,
            resource: noteInputResource,
          }),
        })
        if (res.ok) {
          const data = await res.json()
          setNotes(prev => [...prev, data.note])
        }
      }
      setShowNoteInput(false)
      setNoteInputContent('')
      setEditingNote(null)
    } catch (err) {
      console.error('Failed to save note:', err)
    } finally {
      setSavingNote(false)
    }
  }, [id, noteInputContent, noteInputTimestamp, noteInputResource, editingNote])

  // Delete note
  const handleDeleteNote = useCallback(async (noteId: string) => {
    try {
      const res = await fetch(`/api/sessions/${id}/notes?noteId=${noteId}`, {
        method: 'DELETE',
      })
      if (res.ok) {
        setNotes(prev => prev.filter(n => n.id !== noteId))
      }
    } catch (err) {
      console.error('Failed to delete note:', err)
    }
  }, [id])

  // Jump to note timestamp
  const jumpToNote = useCallback((note: Note) => {
    if (screenVideoRef.current) {
      screenVideoRef.current.currentTime = note.timestamp
    }
    syncAllMedia(note.timestamp)
  }, [syncAllMedia])

  // Format timestamp for display
  const formatTimestamp = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  // Get resource label
  const getResourceLabel = (resource: NoteResource) => {
    const labels: Record<NoteResource, string> = {
      'global': 'Global',
      'screen-video': 'Screen',
      'screen-audio': 'Screen Audio',
      'camera-video': 'Camera',
      'audio-raw': 'Raw Audio',
      'audio-clean': 'Clean Audio',
    }
    return labels[resource]
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-80px)]">
        <div className="text-zinc-400">Loading session...</div>
      </div>
    )
  }

  if (error || !session) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-80px)] gap-4">
        <div className="text-red-400">Error: {error || 'Session not found'}</div>
        <Link href="/" className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg">
          ← Back to Sessions
        </Link>
      </div>
    )
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Link
            href="/"
            className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-sm"
          >
            ← Back
          </Link>
          {/* Favorite button */}
          <button
            onClick={async () => {
              const newFavorite = !session.metadata?.favorite
              try {
                const res = await fetch(`/api/sessions/${id}/metadata`, {
                  method: 'PUT',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ favorite: newFavorite }),
                })
                if (res.ok) {
                  setSession({ ...session, metadata: { ...session.metadata, favorite: newFavorite, score: session.metadata?.score ?? null } })
                }
              } catch (err) {
                console.error('Failed to update favorite:', err)
              }
            }}
            className={`p-2 rounded-lg transition-colors ${
              session.metadata?.favorite
                ? 'text-yellow-400 bg-yellow-400/10 hover:bg-yellow-400/20'
                : 'text-zinc-600 hover:text-zinc-400 hover:bg-zinc-800'
            }`}
            title={session.metadata?.favorite ? 'Remove from favorites' : 'Add to favorites'}
          >
            <svg className="w-6 h-6" fill={session.metadata?.favorite ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
            </svg>
          </button>
          <div>
            <h2 className="text-lg font-mono">{session.id}</h2>
            <p className="text-sm text-zinc-400">
              {new Date(session.timestamp).toLocaleString()} · {formatBytes(session.totalSize)}
            </p>
          </div>
          {/* Score selector */}
          <div className="flex items-center gap-1 ml-2">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                onClick={async () => {
                  const newScore = n === session.metadata?.score ? null : n
                  try {
                    const res = await fetch(`/api/sessions/${id}/metadata`, {
                      method: 'PUT',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ score: newScore }),
                    })
                    if (res.ok) {
                      setSession({ ...session, metadata: { ...session.metadata, favorite: session.metadata?.favorite ?? false, score: newScore } })
                    }
                  } catch (err) {
                    console.error('Failed to update score:', err)
                  }
                }}
                className={`p-1 transition-colors ${
                  session.metadata?.score !== null && session.metadata?.score !== undefined && n <= session.metadata.score
                    ? 'text-amber-400'
                    : 'text-zinc-700 hover:text-zinc-500'
                }`}
                title={`Rate ${n} star${n > 1 ? 's' : ''}`}
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                </svg>
              </button>
            ))}
          </div>
        </div>

        {/* Delete button */}
        <button
          onClick={() => setShowDeleteConfirm(true)}
          className="px-3 py-1.5 text-sm rounded-lg bg-red-600/20 text-red-400 hover:bg-red-600/30 border border-red-600/30"
        >
          Delete Session
        </button>
      </div>

      {/* Delete confirmation modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-zinc-900 rounded-lg p-6 max-w-md w-full mx-4 border border-zinc-700">
            <h3 className="text-lg font-semibold text-red-400 mb-2">Delete Session</h3>
            <p className="text-zinc-300 mb-4">
              This will permanently delete all files for this session from the R2 bucket. This action cannot be undone.
            </p>
            <p className="text-sm text-zinc-400 mb-2">
              Type the session ID to confirm:
            </p>
            <p className="font-mono text-sm text-zinc-500 mb-2 select-all">{id}</p>
            <input
              type="text"
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              placeholder="Enter session ID"
              className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-100 font-mono text-sm mb-4 focus:outline-none focus:border-red-500"
              autoFocus
            />
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => {
                  setShowDeleteConfirm(false)
                  setDeleteConfirmText('')
                }}
                className="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 rounded-lg text-sm"
                disabled={isDeleting}
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleteConfirmText !== id || isDeleting}
                className="px-4 py-2 bg-red-600 hover:bg-red-500 disabled:bg-red-600/50 disabled:cursor-not-allowed rounded-lg text-sm text-white"
              >
                {isDeleting ? 'Deleting...' : 'Delete Permanently'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Note input modal */}
      {showNoteInput && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-zinc-900 rounded-lg p-6 max-w-md w-full mx-4 border border-zinc-700">
            <h3 className="text-lg font-semibold mb-4">
              {editingNote ? 'Edit Note' : 'Add Note'}
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-zinc-400 mb-1">Timestamp</label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={formatTimestamp(noteInputTimestamp)}
                    readOnly
                    className="flex-1 px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-100 font-mono text-sm"
                  />
                  <button
                    onClick={() => setNoteInputTimestamp(currentTime)}
                    className="px-3 py-2 bg-zinc-700 hover:bg-zinc-600 rounded-lg text-sm"
                    title="Use current playback time"
                  >
                    Now
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-sm text-zinc-400 mb-1">Resource</label>
                <select
                  value={noteInputResource}
                  onChange={(e) => setNoteInputResource(e.target.value as NoteResource)}
                  className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-100 text-sm"
                >
                  <option value="global">Global (All tracks)</option>
                  <option value="screen-video">Screen Video</option>
                  <option value="screen-audio">Screen Audio</option>
                  <option value="camera-video">Camera</option>
                  <option value="audio-raw">Raw Mic Audio</option>
                  <option value="audio-clean">Clean Mic Audio</option>
                </select>
              </div>
              <div>
                <label className="block text-sm text-zinc-400 mb-1">Note</label>
                <textarea
                  value={noteInputContent}
                  onChange={(e) => setNoteInputContent(e.target.value)}
                  placeholder="Enter your note..."
                  rows={4}
                  className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-100 text-sm resize-none focus:outline-none focus:border-blue-500"
                  autoFocus
                />
              </div>
            </div>
            <div className="flex gap-3 justify-end mt-6">
              <button
                onClick={() => {
                  setShowNoteInput(false)
                  setNoteInputContent('')
                  setEditingNote(null)
                }}
                className="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 rounded-lg text-sm"
                disabled={savingNote}
              >
                Cancel
              </button>
              <button
                onClick={saveNote}
                disabled={!noteInputContent.trim() || savingNote}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-600/50 disabled:cursor-not-allowed rounded-lg text-sm"
              >
                {savingNote ? 'Saving...' : editingNote ? 'Update' : 'Add Note'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Video Grid */}
      <div className="relative mb-4">
        {/* Main screen video */}
        <div className="bg-black rounded-lg overflow-hidden aspect-video relative group/video">
          {/* Add Note button on video */}
          <button
            onClick={() => openNoteInput('screen-video')}
            className="absolute top-2 left-2 z-10 p-1.5 rounded bg-black/60 text-white/80 hover:text-white hover:bg-black/80 opacity-0 group-hover/video:opacity-100 transition-opacity flex items-center gap-1"
            title="Add note at current time"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
            <span className="text-xs">Note</span>
          </button>
          {mediaUrls.screenVideo ? (
            <video
              ref={screenVideoRef}
              src={mediaUrls.screenVideo}
              className="w-full h-full object-contain"
              onTimeUpdate={handleTimeUpdate}
              onLoadedMetadata={handleLoadedMetadata}
              onEnded={handleEnded}
              muted
              playsInline
            >
              {/* Native VTT subtitle tracks - browser handles timing automatically */}
              {vttUrls.screenAudio && (
                <track
                  key={vttUrls.screenAudio}
                  kind="subtitles"
                  src={vttUrls.screenAudio}
                  srcLang="es"
                  label="Screen Audio (System)"
                  default
                />
              )}
              {audioSource === 'clean' && vttUrls.audioClean && (
                <track
                  key={vttUrls.audioClean}
                  kind="subtitles"
                  src={vttUrls.audioClean}
                  srcLang="es"
                  label="Mic Audio (Clean)"
                />
              )}
              {audioSource === 'raw' && vttUrls.audioRaw && (
                <track
                  key={vttUrls.audioRaw}
                  kind="subtitles"
                  src={vttUrls.audioRaw}
                  srcLang="es"
                  label="Mic Audio (Raw)"
                />
              )}
            </video>
          ) : (
            <div className="flex items-center justify-center h-full text-zinc-500">
              No screen recording available
            </div>
          )}
        </div>

        {/* Transcript box - above camera */}
        {(session.hasScreenAudio || session.hasAudioRaw || session.hasAudioClean) && (
          <div className="absolute bottom-52 right-4 w-72 max-h-48 bg-black/90 rounded-lg border border-zinc-700 overflow-hidden">
            <div className="p-2 border-b border-zinc-700 flex justify-between items-center gap-2">
              <span className="text-xs text-zinc-400">Transcript</span>
              <div className="flex items-center gap-1">
                {session.hasScreenAudio && (
                  <button
                    onClick={() => generateTranscription('screen-audio')}
                    disabled={transcriptions.screenAudio.loading}
                    className="px-1.5 py-0.5 text-[10px] rounded bg-blue-600/30 text-blue-400 hover:bg-blue-600/50 disabled:opacity-50 border border-blue-600/40"
                    title="Screen audio"
                  >
                    {transcriptions.screenAudio.loading ? '...' : transcriptions.screenAudio.cues.length > 0 ? '↻' : '+'}
                  </button>
                )}
                {session.hasAudioRaw && (
                  <button
                    onClick={() => generateTranscription('audio-raw')}
                    disabled={transcriptions.audioRaw.loading}
                    className="px-1.5 py-0.5 text-[10px] rounded bg-amber-600/30 text-amber-400 hover:bg-amber-600/50 disabled:opacity-50 border border-amber-600/40"
                    title="Raw mic"
                  >
                    {transcriptions.audioRaw.loading ? '...' : transcriptions.audioRaw.cues.length > 0 ? '↻' : '+'}
                  </button>
                )}
                {session.hasAudioClean && (
                  <button
                    onClick={() => generateTranscription('audio-clean')}
                    disabled={transcriptions.audioClean.loading}
                    className="px-1.5 py-0.5 text-[10px] rounded bg-emerald-600/30 text-emerald-400 hover:bg-emerald-600/50 disabled:opacity-50 border border-emerald-600/40"
                    title="Clean mic"
                  >
                    {transcriptions.audioClean.loading ? '...' : transcriptions.audioClean.cues.length > 0 ? '↻' : '+'}
                  </button>
                )}
                <span className="text-[10px] font-mono text-zinc-500 ml-1">{currentTime.toFixed(1)}s</span>
              </div>
            </div>
            <div className="p-2 overflow-y-auto max-h-36 space-y-1">
              {(() => {
                // Merge screen audio and mic audio cues into conversation view
                const micCues = audioSource === 'clean' ? transcriptions.audioClean.cues : transcriptions.audioRaw.cues
                const allCues = [
                  ...transcriptions.screenAudio.cues.map(cue => ({ ...cue, source: 'screen' as const })),
                  ...micCues.map(cue => ({ ...cue, source: 'mic' as const })),
                ].sort((a, b) => a.start - b.start)

                if (allCues.length === 0) {
                  return (
                    <div className="text-xs text-zinc-600 text-center py-2">
                      No transcription yet
                    </div>
                  )
                }

                return allCues.map((cue, i) => {
                  const isActive = currentTime >= cue.start && currentTime < cue.end
                  const isScreen = cue.source === 'screen'
                  return (
                    <div
                      key={`${cue.source}-${i}`}
                      className={`text-xs p-1 rounded ${
                        isActive
                          ? 'bg-yellow-500/30 text-yellow-200'
                          : isScreen ? 'text-blue-400/70' : 'text-emerald-400/70'
                      }`}
                    >
                      <span className={`font-mono mr-1 ${isActive ? 'text-yellow-300/70' : 'text-zinc-600'}`}>
                        [{cue.start.toFixed(1)}s]
                      </span>
                      {cue.text.substring(0, 45)}{cue.text.length > 45 ? '...' : ''}
                    </div>
                  )
                })
              })()}
            </div>
          </div>
        )}

        {/* Camera overlay (picture-in-picture style) */}
        {showCamera && mediaUrls.cameraVideo && (
          <div className="absolute bottom-4 right-4 w-64 aspect-video bg-black rounded-lg overflow-hidden border-2 border-zinc-700 shadow-xl group">
            <video
              ref={cameraVideoRef}
              src={mediaUrls.cameraVideo}
              className="w-full h-full object-cover"
              muted
              playsInline
            />
            <button
              onClick={() => openNoteInput('camera-video')}
              className="absolute top-1 left-1 p-1 rounded bg-black/60 text-white/80 hover:text-white hover:bg-black/80 opacity-0 group-hover:opacity-100 transition-opacity"
              title="Add note"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </button>
            <button
              onClick={() => setShowCamera(false)}
              className="absolute top-1 right-1 p-1 rounded bg-black/60 text-white/80 hover:text-white hover:bg-black/80 opacity-0 group-hover:opacity-100 transition-opacity"
              title="Hide camera"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

        {/* Show camera button when hidden */}
        {!showCamera && mediaUrls.cameraVideo && (
          <button
            onClick={() => setShowCamera(true)}
            className="absolute bottom-4 right-4 p-2 rounded-lg bg-zinc-800/80 text-zinc-400 hover:text-white hover:bg-zinc-700/80 border border-zinc-700 transition-colors"
            title="Show camera"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          </button>
        )}

        {/* No camera indicator */}
        {showCamera && !mediaUrls.cameraVideo && (
          <div className="absolute bottom-4 right-4 w-64 aspect-video bg-zinc-900 rounded-lg overflow-hidden border-2 border-zinc-700 flex items-center justify-center group">
            <span className="text-zinc-500 text-sm">No camera</span>
            <button
              onClick={() => setShowCamera(false)}
              className="absolute top-1 right-1 p-1 rounded bg-black/60 text-white/80 hover:text-white hover:bg-black/80 opacity-0 group-hover:opacity-100 transition-opacity"
              title="Hide"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}
      </div>

      {/* Audio elements (hidden) */}
      {mediaUrls.screenAudio && (
        <audio ref={screenAudioRef} src={mediaUrls.screenAudio} preload="auto" />
      )}
      {currentMicAudioUrl && (
        <audio ref={micAudioRef} src={currentMicAudioUrl} preload="auto" />
      )}

      {/* Controls */}
      <div className="bg-zinc-900 rounded-lg p-4 border border-zinc-800">
        <div className="flex items-center gap-4">
          {/* Play/Pause button */}
          <button
            onClick={togglePlayPause}
            className="w-12 h-12 flex items-center justify-center bg-zinc-100 text-zinc-900 rounded-full hover:bg-white transition-colors"
          >
            {isPlaying ? (
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
              </svg>
            ) : (
              <svg className="w-5 h-5 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
            )}
          </button>

          {/* Time display */}
          <div className="text-sm font-mono text-zinc-400 w-24">
            {formatTime(currentTime)} / {formatTime(duration)}
          </div>

          {/* Seek bar */}
          <input
            type="range"
            min={0}
            max={duration || 100}
            value={currentTime}
            onChange={handleSeek}
            className="flex-1 h-2 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-zinc-100"
          />
        </div>

        {/* Speed and Volume Controls */}
        <div className="mt-4 pt-4 border-t border-zinc-700 grid grid-cols-3 gap-6">
          {/* Playback Speed */}
          <div>
            <div className="text-xs text-zinc-400 mb-2">Playback Speed</div>
            <div className="flex gap-1">
              {[0.5, 1, 1.5, 2].map((speed) => (
                <button
                  key={speed}
                  onClick={() => handleSpeedChange(speed)}
                  className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                    playbackSpeed === speed
                      ? 'bg-zinc-100 text-zinc-900'
                      : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                  }`}
                >
                  {speed}x
                </button>
              ))}
            </div>
          </div>

          {/* Screen Audio Volume */}
          <div>
            <div className="text-xs text-zinc-400 mb-2 flex items-center gap-2">
              <span>Screen Audio</span>
              <span className="text-zinc-500">{Math.round(screenVolume * 100)}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={screenVolume}
              onChange={(e) => handleScreenVolumeChange(parseFloat(e.target.value))}
              className="w-full h-2 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
            />
          </div>

          {/* Mic Audio Volume */}
          <div>
            <div className="text-xs text-zinc-400 mb-2 flex items-center gap-2">
              <span>Mic Audio ({audioSource})</span>
              <span className="text-zinc-500">{Math.round(micVolume * 100)}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={micVolume}
              onChange={(e) => handleMicVolumeChange(parseFloat(e.target.value))}
              className="w-full h-2 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-emerald-500"
            />
          </div>
        </div>

        {/* Keyboard shortcuts hint */}
        <div className="mt-3 text-xs text-zinc-500 text-center">
          Space: Play/Pause · ← →: Skip 5s
        </div>
      </div>

      {/* Audio Analysis */}
      <div className="mt-4 grid grid-cols-2 gap-4">
        {/* Screen Audio */}
        {mediaKeys.screenAudio && (
          <div className="bg-zinc-900 rounded-lg p-4 border border-zinc-800">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium">Screen Audio (System)</h3>
              <button
                onClick={() => openNoteInput('screen-audio')}
                className="p-1 rounded bg-zinc-700 text-zinc-400 hover:text-white hover:bg-zinc-600 transition-colors"
                title="Add note at current time"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
              </button>
            </div>
            <AudioWaveformWithStats
              fileKey={mediaKeys.screenAudio}
              label="System Audio"
              currentTime={currentTime}
              duration={duration}
              onSeek={handleWaveformSeek}
              color="#3b82f6"
            />
          </div>
        )}

        {/* Mic Audio Comparison */}
        <AudioComparison
          cleanKey={mediaKeys.audioClean}
          rawKey={mediaKeys.audioRaw}
          cleanUrl={mediaUrls.audioClean}
          rawUrl={mediaUrls.audioRaw}
          currentTime={currentTime}
          duration={duration}
          onSeek={handleWaveformSeek}
          audioSource={audioSource}
          setAudioSource={setAudioSource}
          onAddNote={openNoteInput}
        />
      </div>

      {/* Notes */}
      <div className="mt-4 bg-zinc-900 rounded-lg p-4 border border-zinc-800">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium">Notes ({notes.length})</h3>
          <button
            onClick={() => openNoteInput('global')}
            className="px-2 py-1 text-xs rounded bg-blue-600 hover:bg-blue-500 text-white transition-colors"
          >
            + Add Note
          </button>
        </div>
        {notes.length === 0 ? (
          <div className="text-sm text-zinc-500 text-center py-4">
            No notes yet. Click &quot;Add Note&quot; or use the note buttons on media elements.
          </div>
        ) : (
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {notes
              .sort((a, b) => a.timestamp - b.timestamp)
              .map((note) => (
                <div
                  key={note.id}
                  className="bg-zinc-800 rounded-lg p-3 group hover:bg-zinc-750"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <button
                          onClick={() => jumpToNote(note)}
                          className="text-xs font-mono text-blue-400 hover:text-blue-300"
                          title="Jump to timestamp"
                        >
                          {formatTimestamp(note.timestamp)}
                        </button>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                          note.resource === 'global' ? 'bg-purple-600/30 text-purple-400' :
                          note.resource === 'screen-video' ? 'bg-blue-600/30 text-blue-400' :
                          note.resource === 'screen-audio' ? 'bg-blue-600/30 text-blue-400' :
                          note.resource === 'camera-video' ? 'bg-cyan-600/30 text-cyan-400' :
                          note.resource === 'audio-clean' ? 'bg-emerald-600/30 text-emerald-400' :
                          'bg-amber-600/30 text-amber-400'
                        }`}>
                          {getResourceLabel(note.resource)}
                        </span>
                      </div>
                      <p className="text-sm text-zinc-300">{note.content}</p>
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => openNoteEdit(note)}
                        className="p-1 rounded text-zinc-400 hover:text-white hover:bg-zinc-700"
                        title="Edit note"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </button>
                      <button
                        onClick={() => handleDeleteNote(note.id)}
                        className="p-1 rounded text-zinc-400 hover:text-red-400 hover:bg-zinc-700"
                        title="Delete note"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>
              ))}
          </div>
        )}
      </div>

      {/* Session Files & Duration Analysis - Side by Side */}
      <div className="mt-6 grid grid-cols-2 gap-4">
        {/* File details */}
        <div className="bg-zinc-900 rounded-lg p-4 border border-zinc-800">
          <h3 className="text-sm font-medium mb-3">Session Files</h3>
          <div className="space-y-2">
            {session.files.map((file) => {
              const url = fileUrls[file.key]
              const fileName = file.key.split('/').pop() || file.key
              return (
                <div
                  key={file.key}
                  className="flex items-center justify-between text-sm py-2 border-b border-zinc-800 last:border-0"
                >
                  <span className="font-mono text-zinc-400 text-xs">{file.key.split('/').slice(1).join('/')}</span>
                  <div className="flex items-center gap-3">
                    <span className="text-zinc-500 text-xs">{formatBytes(file.size)}</span>
                    {url ? (
                      <a
                        href={url}
                        download={fileName}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-2 py-1 bg-zinc-700 hover:bg-zinc-600 rounded text-xs text-zinc-200 transition-colors"
                      >
                        Download
                      </a>
                    ) : (
                      <span className="px-2 py-1 bg-zinc-800 rounded text-xs text-zinc-500">
                        Loading...
                      </span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Duration Analysis */}
        {fileDurations.length > 0 && (
          <div className="bg-zinc-900 rounded-lg p-4 border border-zinc-800">
            <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
              Duration Analysis
              {analyzingDurations && (
                <span className="text-xs text-zinc-500">(analyzing...)</span>
              )}
            </h3>

            {(() => {
              const durations = fileDurations.filter(d => d.duration !== null)
              const maxDuration = Math.max(...durations.map(d => d.duration || 0))
              const minDuration = Math.min(...durations.filter(d => d.duration).map(d => d.duration || 0))
              const avgDuration = durations.length > 0
                ? durations.reduce((sum, d) => sum + (d.duration || 0), 0) / durations.length
                : 0
              const hasIrregularity = maxDuration - minDuration > 5 // More than 5 seconds difference

              return (
                <>
                  {/* Summary */}
                  <div className={`mb-4 p-3 rounded-lg ${hasIrregularity ? 'bg-amber-500/10 border border-amber-500/30' : 'bg-emerald-500/10 border border-emerald-500/30'}`}>
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-sm font-medium ${hasIrregularity ? 'text-amber-400' : 'text-emerald-400'}`}>
                        {hasIrregularity ? '⚠ Irregularity Detected' : '✓ Durations Match'}
                      </span>
                    </div>
                    <div className="text-xs text-zinc-400">
                      {durations.length > 0 ? (
                        <>
                          Session length: ~{formatTime(avgDuration)} ·
                          Range: {formatTime(minDuration)} - {formatTime(maxDuration)}
                          {hasIrregularity && (
                            <span className="text-amber-400"> ({(maxDuration - minDuration).toFixed(1)}s difference)</span>
                          )}
                        </>
                      ) : (
                        'Loading durations...'
                      )}
                    </div>
                  </div>

                  {/* Duration bars */}
                  <div className="space-y-2">
                    {fileDurations.map((file) => {
                      const label = file.type.replace('-', ' ').replace(/\b\w/g, l => l.toUpperCase())
                      const pct = file.duration && maxDuration > 0
                        ? (file.duration / maxDuration) * 100
                        : 0
                      const isShort = file.duration !== null && maxDuration - file.duration > 5

                      return (
                        <div key={file.key} className="text-sm">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-zinc-400 text-xs">{label}</span>
                            <span className={`font-mono text-xs ${file.error ? 'text-red-400' : isShort ? 'text-amber-400' : 'text-zinc-500'}`}>
                              {file.loading ? 'Loading...' : file.error ? file.error : file.duration ? formatTime(file.duration) : 'N/A'}
                              {isShort && file.duration && (
                                <span className="ml-1">(-{(maxDuration - file.duration).toFixed(1)}s)</span>
                              )}
                            </span>
                          </div>
                          <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all duration-500 ${
                                file.loading ? 'bg-zinc-600 animate-pulse' :
                                file.error ? 'bg-red-500' :
                                isShort ? 'bg-amber-500' : 'bg-emerald-500'
                              }`}
                              style={{ width: file.loading ? '30%' : `${pct}%` }}
                            />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </>
              )
            })()}
          </div>
        )}
      </div>
    </div>
  )
}
