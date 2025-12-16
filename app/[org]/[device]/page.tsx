'use client'

import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import Link from 'next/link'
import { use } from 'react'
import Breadcrumb from '@/components/Breadcrumb'

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
  id: string           // Display ID: sess_xxxxx
  fullId: string       // Folder name: HH-MM-SS_sess_xxxxx (used in URLs)
  org: string
  device: string
  year: string
  month: string
  day: string
  time: string
  prefix: string
  timestamp: string
  files: SessionFile[]
  hasScreenVideo: boolean
  hasScreenAudio: boolean
  hasCameraVideo: boolean
  hasAudioRaw: boolean
  hasAudioClean: boolean
  totalSize: number
  metadata: SessionMetadata
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
}

function formatDate(dateString: string): string {
  const date = new Date(dateString)
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

function getDateKey(dateString: string): string {
  const date = new Date(dateString)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function isSessionComplete(session: Session): boolean {
  return (
    session.hasScreenVideo &&
    session.hasScreenAudio &&
    session.hasCameraVideo &&
    session.hasAudioRaw &&
    session.hasAudioClean
  )
}

interface HourStats {
  hour: number
  label: string
  count: number
  complete: number
  incomplete: number
}

function SessionsPerHourChart({ sessions }: { sessions: Session[] }) {
  const [selectedDate, setSelectedDate] = useState(() => {
    const today = new Date()
    return getDateKey(today.toISOString())
  })

  const earliestDate = useMemo(() => {
    if (sessions.length === 0) return selectedDate
    const dates = sessions.map((s) => getDateKey(s.timestamp))
    return dates.sort()[0]
  }, [sessions, selectedDate])

  const isToday = selectedDate === getDateKey(new Date().toISOString())
  const canGoForward = !isToday
  const canGoBack = selectedDate > earliestDate

  const navigateDay = (direction: 'prev' | 'next') => {
    const [year, month, day] = selectedDate.split('-').map(Number)
    const current = new Date(year, month - 1, day)
    current.setDate(current.getDate() + (direction === 'next' ? 1 : -1))
    setSelectedDate(getDateKey(current.toISOString()))
  }

  const hourStats = useMemo(() => {
    const hours: HourStats[] = []
    for (let h = 0; h < 24; h++) {
      hours.push({
        hour: h,
        label: h.toString().padStart(2, '0'),
        count: 0,
        complete: 0,
        incomplete: 0,
      })
    }

    for (const session of sessions) {
      const sessionDate = getDateKey(session.timestamp)
      if (sessionDate !== selectedDate) continue

      const sessionHour = new Date(session.timestamp).getHours()
      const hour = hours[sessionHour]
      hour.count++
      if (isSessionComplete(session)) {
        hour.complete++
      } else {
        hour.incomplete++
      }
    }

    return hours
  }, [sessions, selectedDate])

  const maxCount = Math.max(...hourStats.map((h) => h.count), 1)
  const totalForDay = hourStats.reduce((sum, h) => sum + h.count, 0)

  const displayDate = useMemo(() => {
    const [year, month, day] = selectedDate.split('-').map(Number)
    const date = new Date(year, month - 1, day)
    const today = new Date()
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)

    if (selectedDate === getDateKey(today.toISOString())) return 'Today'
    if (selectedDate === getDateKey(yesterday.toISOString())) return 'Yesterday'

    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    })
  }, [selectedDate])

  return (
    <div className="bg-zinc-900 rounded-lg p-4 border border-zinc-800 mb-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-zinc-300">Sessions by Hour</h3>
        <div className="flex items-center gap-3">
          <span className="text-xs text-zinc-500">
            {totalForDay} session{totalForDay !== 1 ? 's' : ''}
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => navigateDay('prev')}
              disabled={!canGoBack}
              className="p-1 rounded bg-zinc-800 text-zinc-400 hover:bg-zinc-700 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <span className="text-sm text-zinc-300 min-w-[100px] text-center font-medium">
              {displayDate}
            </span>
            <button
              onClick={() => navigateDay('next')}
              disabled={!canGoForward}
              className="p-1 rounded bg-zinc-800 text-zinc-400 hover:bg-zinc-700 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      <div className="flex items-end gap-px h-28">
        {hourStats.map((hour) => {
          const heightPct = (hour.count / maxCount) * 100
          const completeHeightPct = hour.count > 0 ? (hour.complete / hour.count) * heightPct : 0

          return (
            <div key={hour.hour} className="flex-1 flex flex-col items-center group relative">
              {hour.count > 0 && (
                <div className="absolute bottom-full mb-2 hidden group-hover:block z-10">
                  <div className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs whitespace-nowrap">
                    <div className="font-medium">{hour.label}:00 - {hour.label}:59</div>
                    <div className="text-zinc-400">
                      {hour.count} session{hour.count !== 1 ? 's' : ''}
                      <span className="text-emerald-400 ml-1">
                        ({hour.complete} complete)
                      </span>
                    </div>
                  </div>
                </div>
              )}

              <div className="w-full flex flex-col justify-end h-20">
                {hour.count > 0 ? (
                  <div
                    className="w-full rounded-t transition-all relative overflow-hidden"
                    style={{ height: `${heightPct}%`, minHeight: '4px' }}
                  >
                    <div
                      className="absolute top-0 left-0 right-0 bg-amber-500/60"
                      style={{ height: `${100 - (completeHeightPct / heightPct) * 100}%` }}
                    />
                    <div
                      className="absolute bottom-0 left-0 right-0 bg-emerald-500"
                      style={{ height: `${(completeHeightPct / heightPct) * 100}%` }}
                    />
                  </div>
                ) : (
                  <div className="w-full h-px bg-zinc-800" />
                )}
              </div>

              <div className="text-[10px] text-zinc-600 mt-1 leading-none">
                {hour.hour}
              </div>
            </div>
          )
        })}
      </div>

      <div className="flex items-center justify-end mt-2">
        <div className="flex items-center gap-4 text-xs text-zinc-500">
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 bg-emerald-500 rounded" />
            <span>Complete</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 bg-amber-500/60 rounded" />
            <span>Incomplete</span>
          </div>
        </div>
      </div>
    </div>
  )
}

function FileIndicator({ present, label }: { present: boolean; label: string }) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
        present
          ? 'bg-emerald-500/20 text-emerald-400'
          : 'bg-red-500/20 text-red-400'
      }`}
    >
      {present ? '✓' : '✗'} {label}
    </span>
  )
}

function FavoriteButton({
  sessionId,
  org,
  device,
  favorite,
  onUpdate
}: {
  sessionId: string
  org: string
  device: string
  favorite: boolean
  onUpdate: (favorite: boolean) => void
}) {
  const [loading, setLoading] = useState(false)

  const toggle = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setLoading(true)
    try {
      const res = await fetch(`/api/sessions/${sessionId}/metadata?org=${encodeURIComponent(org)}&device=${encodeURIComponent(device)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ favorite: !favorite }),
      })
      if (res.ok) {
        onUpdate(!favorite)
      }
    } catch (err) {
      console.error('Failed to update favorite:', err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      onClick={toggle}
      disabled={loading}
      className={`p-1 rounded transition-colors ${
        favorite
          ? 'text-yellow-400 hover:text-yellow-300'
          : 'text-zinc-600 hover:text-zinc-400'
      } ${loading ? 'opacity-50' : ''}`}
      title={favorite ? 'Remove from favorites' : 'Add to favorites'}
    >
      <svg className="w-5 h-5" fill={favorite ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
      </svg>
    </button>
  )
}

function ScoreSelector({
  sessionId,
  org,
  device,
  score,
  onUpdate,
}: {
  sessionId: string
  org: string
  device: string
  score: number | null
  onUpdate: (score: number | null) => void
}) {
  const [loading, setLoading] = useState(false)

  const setScore = async (e: React.MouseEvent, newScore: number) => {
    e.preventDefault()
    e.stopPropagation()
    setLoading(true)
    try {
      const finalScore = newScore === score ? null : newScore
      const res = await fetch(`/api/sessions/${sessionId}/metadata?org=${encodeURIComponent(org)}&device=${encodeURIComponent(device)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ score: finalScore }),
      })
      if (res.ok) {
        onUpdate(finalScore)
      }
    } catch (err) {
      console.error('Failed to update score:', err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={`flex items-center gap-0.5 ${loading ? 'opacity-50' : ''}`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          onClick={(e) => setScore(e, n)}
          disabled={loading}
          className={`p-0.5 transition-colors ${
            score !== null && n <= score
              ? 'text-amber-400'
              : 'text-zinc-700 hover:text-zinc-500'
          }`}
          title={`Rate ${n} star${n > 1 ? 's' : ''}`}
        >
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
            <path d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
          </svg>
        </button>
      ))}
    </div>
  )
}

export default function SessionsPage({ params }: { params: Promise<{ org: string; device: string }> }) {
  const { org, device } = use(params)
  const decodedOrg = decodeURIComponent(org)
  const decodedDevice = decodeURIComponent(device)

  const [sessions, setSessions] = useState<Session[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<'all' | 'complete' | 'incomplete' | 'favorites'>('all')
  const [metadataLoading, setMetadataLoading] = useState(false)

  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState(10)

  const [autoRefresh, setAutoRefresh] = useState(false)
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const refreshIntervalRef = useRef<NodeJS.Timeout | null>(null)

  const metadataFetchedRef = useRef<Set<string>>(new Set())

  const [durations, setDurations] = useState<Record<string, number>>({})
  const durationFetchedRef = useRef<Set<string>>(new Set())

  const fetchSessions = useCallback(async (showFullLoading = true) => {
    try {
      if (showFullLoading && sessions.length === 0) {
        setLoading(true)
      } else {
        setIsRefreshing(true)
      }
      const res = await fetch(`/api/sessions?org=${encodeURIComponent(decodedOrg)}&device=${encodeURIComponent(decodedDevice)}`)
      if (!res.ok) throw new Error('Failed to fetch sessions')
      const data = await res.json()
      const newSessions = data.sessions as Session[]

      setSessions(prev => {
        const metadataMap = new Map(prev.map(s => [s.fullId, s.metadata]))
        return newSessions.map(s => ({
          ...s,
          metadata: metadataMap.get(s.fullId) || s.metadata
        }))
      })

      setLastRefresh(new Date())
      setError(null)
    } catch (err) {
      setError(String(err))
    } finally {
      setLoading(false)
      setIsRefreshing(false)
    }
  }, [sessions.length, decodedOrg, decodedDevice])

  useEffect(() => {
    fetchSessions()
  }, [fetchSessions])

  useEffect(() => {
    if (autoRefresh) {
      refreshIntervalRef.current = setInterval(() => {
        fetchSessions(true)
      }, 5000)
    } else {
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current)
        refreshIntervalRef.current = null
      }
    }

    return () => {
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current)
      }
    }
  }, [autoRefresh, fetchSessions])

  const filteredSessions = useMemo(() => {
    return sessions.filter((session) => {
      const isComplete = isSessionComplete(session)
      if (filter === 'complete') return isComplete
      if (filter === 'incomplete') return !isComplete
      if (filter === 'favorites') return session.metadata?.favorite === true
      return true
    })
  }, [sessions, filter])

  useEffect(() => {
    setCurrentPage(1)
  }, [filter])

  const totalPages = Math.ceil(filteredSessions.length / itemsPerPage)
  const startIndex = (currentPage - 1) * itemsPerPage
  const endIndex = startIndex + itemsPerPage
  const paginatedSessions = filteredSessions.slice(startIndex, endIndex)

  useEffect(() => {
    if (paginatedSessions.length === 0 || loading) return

    const sessionsToFetch = paginatedSessions.filter(s => !metadataFetchedRef.current.has(s.fullId))
    if (sessionsToFetch.length === 0) {
      setMetadataLoading(false)
      return
    }

    setMetadataLoading(true)

    const fetchVisibleMetadata = async () => {
      await Promise.all(
        sessionsToFetch.map(async (session) => {
          try {
            const res = await fetch(`/api/sessions/${session.fullId}/metadata?org=${encodeURIComponent(decodedOrg)}&device=${encodeURIComponent(decodedDevice)}`)
            if (res.ok) {
              const metadata = await res.json()
              metadataFetchedRef.current.add(session.fullId)
              setSessions(prev => prev.map(s =>
                s.fullId === session.fullId ? { ...s, metadata } : s
              ))
            }
          } catch (err) {
            console.error(`Failed to fetch metadata for ${session.fullId}:`, err)
          }
        })
      )
      setMetadataLoading(false)
    }

    fetchVisibleMetadata()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paginatedSessions.map(s => s.fullId).join(','), loading, decodedOrg, decodedDevice])

  useEffect(() => {
    if (paginatedSessions.length === 0 || loading) return

    const sessionsToFetch = paginatedSessions.filter(
      s => s.hasScreenVideo && !durationFetchedRef.current.has(s.fullId)
    )
    if (sessionsToFetch.length === 0) return

    sessionsToFetch.forEach(async (session) => {
      try {
        durationFetchedRef.current.add(session.fullId)

        const res = await fetch(`/api/sessions/${session.fullId}/video-url?org=${encodeURIComponent(decodedOrg)}&device=${encodeURIComponent(decodedDevice)}`)
        if (!res.ok) return
        const { url } = await res.json()

        const video = document.createElement('video')
        video.preload = 'metadata'
        video.src = url

        video.onloadedmetadata = () => {
          if (video.duration && isFinite(video.duration)) {
            setDurations(prev => ({ ...prev, [session.fullId]: video.duration }))
          }
          video.remove()
        }

        video.onerror = () => {
          console.error(`Failed to load video metadata for ${session.fullId}`)
          video.remove()
        }
      } catch (err) {
        console.error(`Failed to fetch video URL for ${session.fullId}:`, err)
      }
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paginatedSessions.map(s => s.fullId).join(','), loading, decodedOrg, decodedDevice])

  const getPageNumbers = () => {
    const pages: (number | 'ellipsis')[] = []
    const showPages = 5

    if (totalPages <= showPages) {
      for (let i = 1; i <= totalPages; i++) pages.push(i)
    } else {
      pages.push(1)

      if (currentPage > 3) pages.push('ellipsis')

      const start = Math.max(2, currentPage - 1)
      const end = Math.min(totalPages - 1, currentPage + 1)

      for (let i = start; i <= end; i++) pages.push(i)

      if (currentPage < totalPages - 2) pages.push('ellipsis')

      pages.push(totalPages)
    }

    return pages
  }

  const stats = useMemo(() => ({
    total: sessions.length,
    complete: sessions.filter((s) => isSessionComplete(s)).length,
    missingCamera: sessions.filter((s) => !s.hasCameraVideo).length,
    missingAudio: sessions.filter((s) => !s.hasAudioRaw || !s.hasAudioClean).length,
    favorites: sessions.filter((s) => s.metadata?.favorite === true).length,
  }), [sessions])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-80px)]">
        <div className="text-zinc-400">Loading sessions...</div>
      </div>
    )
  }

  if (error && sessions.length === 0) {
    return (
      <div className="p-6">
        <Breadcrumb items={[
          { label: 'Organizations', href: '/' },
          { label: decodedOrg, href: `/${encodeURIComponent(decodedOrg)}` },
          { label: decodedDevice }
        ]} />
        <div className="flex flex-col items-center justify-center h-[calc(100vh-200px)] gap-4">
          <div className="text-red-400">Error: {error}</div>
          <button
            onClick={() => fetchSessions()}
            className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg"
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6">
      <Breadcrumb items={[
        { label: 'Organizations', href: '/' },
        { label: decodedOrg, href: `/${encodeURIComponent(decodedOrg)}` },
        { label: decodedDevice }
      ]} />

      {/* Stats Bar */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-zinc-900 rounded-lg p-4 border border-zinc-800">
          <div className="text-2xl font-bold">{stats.total}</div>
          <div className="text-sm text-zinc-400">Total Sessions</div>
        </div>
        <div className="bg-zinc-900 rounded-lg p-4 border border-zinc-800">
          <div className="text-2xl font-bold text-emerald-400">{stats.complete}</div>
          <div className="text-sm text-zinc-400">Complete</div>
        </div>
        <div className="bg-zinc-900 rounded-lg p-4 border border-zinc-800">
          <div className="text-2xl font-bold text-amber-400">{stats.missingCamera}</div>
          <div className="text-sm text-zinc-400">Missing Camera</div>
        </div>
        <div className="bg-zinc-900 rounded-lg p-4 border border-zinc-800">
          <div className="text-2xl font-bold text-red-400">{stats.missingAudio}</div>
          <div className="text-sm text-zinc-400">Missing Audio</div>
        </div>
      </div>

      {sessions.length > 0 && <SessionsPerHourChart sessions={sessions} />}

      {/* Filter Tabs */}
      <div className="flex gap-2 mb-4">
        {(['all', 'favorites', 'complete', 'incomplete'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              filter === f
                ? f === 'favorites' ? 'bg-yellow-500 text-black' : 'bg-zinc-100 text-zinc-900'
                : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
            }`}
          >
            {f === 'favorites' ? '★ Favorites' : f.charAt(0).toUpperCase() + f.slice(1)}
            {f === 'all' && ` (${sessions.length})`}
            {f === 'favorites' && ` (${metadataLoading ? '...' : stats.favorites})`}
            {f === 'complete' && ` (${stats.complete})`}
            {f === 'incomplete' && ` (${sessions.length - stats.complete})`}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-2">
          {isRefreshing && (
            <div className="flex items-center gap-2 text-xs text-zinc-400">
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              Refreshing...
            </div>
          )}

          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`px-3 py-2 rounded-lg text-sm flex items-center gap-2 transition-colors ${
              autoRefresh
                ? 'bg-emerald-600 text-white'
                : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
            }`}
          >
            <span className={`w-2 h-2 rounded-full ${autoRefresh ? 'bg-white animate-pulse' : 'bg-zinc-500'}`} />
            Auto {autoRefresh ? 'On' : 'Off'}
          </button>

          <button
            onClick={() => fetchSessions()}
            disabled={isRefreshing}
            className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 rounded-lg text-sm"
          >
            ↻ Refresh
          </button>

          {lastRefresh && (
            <span className="text-xs text-zinc-500">
              {lastRefresh.toLocaleTimeString()}
            </span>
          )}
        </div>
      </div>

      {/* Sessions List */}
      <div className="space-y-2">
        {filteredSessions.length === 0 ? (
          <div className="text-center py-12 text-zinc-500">
            No sessions found
          </div>
        ) : (
          paginatedSessions.map((session) => (
            <Link
              key={session.fullId}
              href={`/${encodeURIComponent(decodedOrg)}/${encodeURIComponent(decodedDevice)}/${encodeURIComponent(session.fullId)}`}
              className="block bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded-lg p-4 transition-colors"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <FavoriteButton
                    sessionId={session.fullId}
                    org={decodedOrg}
                    device={decodedDevice}
                    favorite={session.metadata?.favorite ?? false}
                    onUpdate={(favorite) => {
                      setSessions(prev => prev.map(s =>
                        s.fullId === session.fullId
                          ? { ...s, metadata: { ...s.metadata, favorite } }
                          : s
                      ))
                    }}
                  />
                  <div>
                    <div className="font-mono text-sm text-zinc-300">
                      {session.id}
                    </div>
                    <div className="text-xs text-zinc-500">
                      {session.year}-{session.month}-{session.day} {session.time.replace(/-/g, ':')} · {formatBytes(session.totalSize)}
                      {durations[session.fullId] !== undefined && (
                        <span className="text-zinc-400"> · {formatDuration(durations[session.fullId])}</span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <ScoreSelector
                    sessionId={session.fullId}
                    org={decodedOrg}
                    device={decodedDevice}
                    score={session.metadata?.score ?? null}
                    onUpdate={(score) => {
                      setSessions(prev => prev.map(s =>
                        s.fullId === session.fullId
                          ? { ...s, metadata: { ...s.metadata, score } }
                          : s
                      ))
                    }}
                  />
                  <div className="flex items-center gap-2">
                    <FileIndicator present={session.hasScreenVideo} label="Screen" />
                    <FileIndicator present={session.hasCameraVideo} label="Camera" />
                    <FileIndicator
                      present={session.hasAudioRaw && session.hasAudioClean}
                      label="Audio"
                    />
                  </div>
                </div>
              </div>
            </Link>
          ))
        )}
      </div>

      {/* Pagination */}
      {filteredSessions.length > 0 && (
        <div className="mt-6 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-zinc-400">
            <span>Show</span>
            <select
              value={itemsPerPage}
              onChange={(e) => {
                setItemsPerPage(Number(e.target.value))
                setCurrentPage(1)
              }}
              className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-zinc-200 focus:outline-none focus:border-zinc-500"
            >
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
            <span>per page</span>
          </div>

          <div className="text-sm text-zinc-500">
            Showing {startIndex + 1}-{Math.min(endIndex, filteredSessions.length)} of {filteredSessions.length}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center gap-1">
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="px-2 py-1 rounded bg-zinc-800 text-zinc-400 hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                ←
              </button>

              {getPageNumbers().map((page, idx) =>
                page === 'ellipsis' ? (
                  <span key={`ellipsis-${idx}`} className="px-2 text-zinc-600">
                    ...
                  </span>
                ) : (
                  <button
                    key={page}
                    onClick={() => setCurrentPage(page)}
                    className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                      currentPage === page
                        ? 'bg-zinc-100 text-zinc-900'
                        : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                    }`}
                  >
                    {page}
                  </button>
                )
              )}

              <button
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="px-2 py-1 rounded bg-zinc-800 text-zinc-400 hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                →
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
