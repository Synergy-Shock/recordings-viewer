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

interface Session {
  id: string
  timestamp: string
  files: SessionFile[]
  hasScreenVideo: boolean
  hasScreenAudio: boolean
  hasCameraVideo: boolean
  hasAudioRaw: boolean
  hasAudioClean: boolean
  totalSize: number
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

function AudioWaveform({
  fileKey,
  label,
  currentTime,
  duration: totalDuration,
  onSeek,
  color = '#10b981'
}: {
  fileKey: string
  label: string
  currentTime: number
  duration: number
  onSeek: (time: number) => void
  color?: string
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [waveformData, setWaveformData] = useState<WaveformData | null>(null)
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

        for (let i = 0; i < samples; i++) {
          let sum = 0
          for (let j = 0; j < blockSize; j++) {
            sum += Math.abs(rawData[i * blockSize + j])
          }
          peaks.push(sum / blockSize)
        }

        // Normalize peaks
        const maxPeak = Math.max(...peaks)
        const normalizedPeaks = peaks.map(p => p / maxPeak)

        setWaveformData({ peaks: normalizedPeaks, duration: audioBuffer.duration })
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
    ctx.fillStyle = '#27272a'
    ctx.fillRect(0, 0, width, height)

    // Draw bars
    peaks.forEach((peak, i) => {
      const x = i * barWidth
      const barHeight = peak * height * 0.8
      const y = (height - barHeight) / 2

      // Color bars based on playhead position
      ctx.fillStyle = x < playheadPosition ? color : '#52525b'
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
    <div className="bg-zinc-800 rounded-lg p-3">
      <div className="text-xs text-zinc-400 mb-2">{label}</div>
      {loading ? (
        <div className="h-12 flex items-center justify-center text-xs text-zinc-500">
          Loading waveform...
        </div>
      ) : error ? (
        <div className="h-12 flex items-center justify-center text-xs text-red-400">
          {error}
        </div>
      ) : (
        <canvas
          ref={canvasRef}
          width={600}
          height={48}
          onClick={handleClick}
          className="w-full h-12 rounded cursor-pointer"
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
          }
        } catch (err) {
          console.error(`Failed to get URL for ${file.key}:`, err)
        }
      }

      setMediaUrls(urls)
      setMediaKeys(keys)
      setFileUrls(downloadUrls)
    }

    loadUrls()
  }, [session])

  // Analyze durations of all media files
  useEffect(() => {
    if (Object.keys(fileUrls).length === 0 || !session) return

    setAnalyzingDurations(true)

    // Initialize durations state
    const initialDurations: FileDuration[] = session.files
      .filter(f => f.type !== 'unknown')
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
      if (!url || file.type === 'unknown') return

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
          <div>
            <h2 className="text-lg font-mono">{session.id}</h2>
            <p className="text-sm text-zinc-400">
              {new Date(session.timestamp).toLocaleString()} · {formatBytes(session.totalSize)}
            </p>
          </div>
        </div>

        {/* Audio source toggle */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-zinc-400">Audio:</span>
          <div className="flex rounded-lg overflow-hidden border border-zinc-700">
            <button
              onClick={() => setAudioSource('clean')}
              className={`px-3 py-1.5 text-sm ${
                audioSource === 'clean'
                  ? 'bg-emerald-600 text-white'
                  : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
              }`}
            >
              Clean
            </button>
            <button
              onClick={() => setAudioSource('raw')}
              className={`px-3 py-1.5 text-sm ${
                audioSource === 'raw'
                  ? 'bg-amber-600 text-white'
                  : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
              }`}
            >
              Raw
            </button>
          </div>

          {/* Camera toggle */}
          <button
            onClick={() => setShowCamera(!showCamera)}
            className={`ml-4 px-3 py-1.5 text-sm rounded-lg ${
              showCamera
                ? 'bg-blue-600 text-white'
                : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
            }`}
          >
            {showCamera ? 'Hide' : 'Show'} Camera
          </button>

          {/* Delete button */}
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="ml-4 px-3 py-1.5 text-sm rounded-lg bg-red-600/20 text-red-400 hover:bg-red-600/30 border border-red-600/30"
          >
            Delete Session
          </button>
        </div>
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

      {/* Video Grid */}
      <div className="relative mb-4">
        {/* Main screen video */}
        <div className="bg-black rounded-lg overflow-hidden aspect-video">
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
            />
          ) : (
            <div className="flex items-center justify-center h-full text-zinc-500">
              No screen recording available
            </div>
          )}
        </div>

        {/* Camera overlay (picture-in-picture style) */}
        {showCamera && mediaUrls.cameraVideo && (
          <div className="absolute bottom-4 right-4 w-64 aspect-video bg-black rounded-lg overflow-hidden border-2 border-zinc-700 shadow-xl">
            <video
              ref={cameraVideoRef}
              src={mediaUrls.cameraVideo}
              className="w-full h-full object-cover"
              muted
              playsInline
            />
          </div>
        )}

        {/* No camera indicator */}
        {showCamera && !mediaUrls.cameraVideo && (
          <div className="absolute bottom-4 right-4 w-64 aspect-video bg-zinc-900 rounded-lg overflow-hidden border-2 border-zinc-700 flex items-center justify-center">
            <span className="text-zinc-500 text-sm">No camera</span>
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

      {/* Audio Waveforms */}
      {(mediaKeys.screenAudio || currentMicAudioKey) && (
        <div className="mt-4 space-y-2">
          {mediaKeys.screenAudio && (
            <AudioWaveform
              fileKey={mediaKeys.screenAudio}
              label="Screen Audio Waveform"
              currentTime={currentTime}
              duration={duration}
              onSeek={handleWaveformSeek}
              color="#3b82f6"
            />
          )}
          {currentMicAudioKey && (
            <AudioWaveform
              fileKey={currentMicAudioKey}
              label={`Mic Audio Waveform (${audioSource})`}
              currentTime={currentTime}
              duration={duration}
              onSeek={handleWaveformSeek}
              color="#10b981"
            />
          )}
        </div>
      )}

      {/* Duration Analysis */}
      {fileDurations.length > 0 && (
        <div className="mt-6 bg-zinc-900 rounded-lg p-4 border border-zinc-800">
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
                          <span className="text-zinc-400">{label}</span>
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

      {/* File details */}
      <div className="mt-6 bg-zinc-900 rounded-lg p-4 border border-zinc-800">
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
                <span className="font-mono text-zinc-400">{file.key.split('/').slice(1).join('/')}</span>
                <div className="flex items-center gap-4">
                  <span className="text-zinc-500">{formatBytes(file.size)}</span>
                  {url ? (
                    <a
                      href={url}
                      download={fileName}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3 py-1 bg-zinc-700 hover:bg-zinc-600 rounded text-xs text-zinc-200 transition-colors"
                    >
                      Download
                    </a>
                  ) : (
                    <span className="px-3 py-1 bg-zinc-800 rounded text-xs text-zinc-500">
                      Loading...
                    </span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
