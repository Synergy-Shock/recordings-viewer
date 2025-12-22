'use client'

import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import Link from 'next/link'
import { use } from 'react'
import Breadcrumb from '@/components/Breadcrumb'
import SessionAnalytics from '@/components/SessionAnalytics'

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


function isSessionComplete(session: Session): boolean {
  return (
    session.hasScreenVideo &&
    session.hasScreenAudio &&
    session.hasCameraVideo &&
    session.hasAudioRaw &&
    session.hasAudioClean
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

// LocalStorage key for duration cache
const DURATION_CACHE_KEY = 'recordings-viewer-duration-cache'
const DURATION_CACHE_VERSION = 1

interface DurationCache {
  version: number
  data: Record<string, number>
}

function loadDurationCache(): Record<string, number> {
  if (typeof window === 'undefined') return {}
  try {
    const cached = localStorage.getItem(DURATION_CACHE_KEY)
    if (!cached) return {}
    const parsed: DurationCache = JSON.parse(cached)
    if (parsed.version !== DURATION_CACHE_VERSION) return {}
    return parsed.data || {}
  } catch {
    return {}
  }
}

function saveDurationCache(data: Record<string, number>): void {
  if (typeof window === 'undefined') return
  try {
    const cache: DurationCache = { version: DURATION_CACHE_VERSION, data }
    localStorage.setItem(DURATION_CACHE_KEY, JSON.stringify(cache))
  } catch {
    // Ignore localStorage errors
  }
}

export default function SessionsPage({ params }: { params: Promise<{ org: string; device: string }> }) {
  const { org, device } = use(params)
  const decodedOrg = decodeURIComponent(org)
  const decodedDevice = decodeURIComponent(device)

  const [sessions, setSessions] = useState<Session[]>([])
  const [orgName, setOrgName] = useState<string | null>(null)
  const [deviceName, setDeviceName] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<'all' | 'complete' | 'incomplete' | 'favorites'>('all')
  const [dateFilter, setDateFilter] = useState<string | null>(null)
  const [metadataLoading, setMetadataLoading] = useState(false)

  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState(10)

  const [autoRefresh, setAutoRefresh] = useState(false)
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const refreshIntervalRef = useRef<NodeJS.Timeout | null>(null)

  const metadataFetchedRef = useRef<Set<string>>(new Set())

  // Initialize durations from cache
  const [durations, setDurations] = useState<Record<string, number>>(() => loadDurationCache())
  const durationFetchedRef = useRef<Set<string>>(new Set())

  // Notes counts (not cached - always fetch fresh)
  const [noteCounts, setNoteCounts] = useState<Record<string, number>>({})
  const [noteCountsLoading, setNoteCountsLoading] = useState<Set<string>>(new Set())

  // Display names (fallback to IDs if no name)
  const orgDisplayName = orgName || decodedOrg
  const deviceDisplayName = deviceName || decodedDevice

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

      // Update org/device names from metadata
      if (data.orgName) setOrgName(data.orgName)
      if (data.deviceName) setDeviceName(data.deviceName)

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
      // Apply date filter first
      if (dateFilter) {
        const sessionDate = `${session.year}-${session.month}-${session.day}`
        if (sessionDate !== dateFilter) return false
      }

      // Then apply status filter
      const isComplete = isSessionComplete(session)
      if (filter === 'complete') return isComplete
      if (filter === 'incomplete') return !isComplete
      if (filter === 'favorites') return session.metadata?.favorite === true
      return true
    })
  }, [sessions, filter, dateFilter])

  useEffect(() => {
    setCurrentPage(1)
  }, [filter, dateFilter])

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

    // Filter out sessions that already have duration in state (includes cached)
    const sessionsToFetch = paginatedSessions.filter(
      s => s.hasScreenVideo && !durations[s.fullId] && !durationFetchedRef.current.has(s.fullId)
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
            setDurations(prev => {
              const newDurations = { ...prev, [session.fullId]: video.duration }
              // Save to localStorage cache
              saveDurationCache(newDurations)
              return newDurations
            })
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
  }, [paginatedSessions.map(s => s.fullId).join(','), loading, decodedOrg, decodedDevice, durations])

  // Fetch notes counts for visible sessions (not cached - always fresh)
  useEffect(() => {
    if (paginatedSessions.length === 0 || loading) return

    // Get session IDs that we don't have counts for yet
    const sessionsToFetch = paginatedSessions.filter(
      s => noteCounts[s.fullId] === undefined && !noteCountsLoading.has(s.fullId)
    )
    if (sessionsToFetch.length === 0) return

    const idsToFetch = sessionsToFetch.map(s => s.fullId)

    // Mark as loading
    setNoteCountsLoading(prev => {
      const next = new Set(prev)
      idsToFetch.forEach(id => next.add(id))
      return next
    })

    // Fetch counts in one batch request
    const fetchNoteCounts = async () => {
      try {
        const res = await fetch(
          `/api/sessions/notes-count?org=${encodeURIComponent(decodedOrg)}&device=${encodeURIComponent(decodedDevice)}&ids=${idsToFetch.join(',')}`
        )
        if (res.ok) {
          const data = await res.json()
          setNoteCounts(prev => ({ ...prev, ...data.counts }))
        }
      } catch (err) {
        console.error('Failed to fetch notes counts:', err)
      } finally {
        // Remove from loading set
        setNoteCountsLoading(prev => {
          const next = new Set(prev)
          idsToFetch.forEach(id => next.delete(id))
          return next
        })
      }
    }

    fetchNoteCounts()
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

  const stats = useMemo(() => {
    // Helper to check if session is in date range
    const isInWeek = (session: Session, weekStart: Date, weekEnd: Date) => {
      const sessionDate = new Date(
        parseInt(session.year),
        parseInt(session.month) - 1,
        parseInt(session.day)
      )
      return sessionDate >= weekStart && sessionDate <= weekEnd
    }

    // Calculate this week's date range (Monday to Sunday)
    const today = new Date()
    const dayOfWeek = today.getDay()
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek
    const thisWeekStart = new Date(today)
    thisWeekStart.setDate(today.getDate() + mondayOffset)
    thisWeekStart.setHours(0, 0, 0, 0)
    const thisWeekEnd = new Date(thisWeekStart)
    thisWeekEnd.setDate(thisWeekStart.getDate() + 6)
    thisWeekEnd.setHours(23, 59, 59, 999)

    // Last week's date range
    const lastWeekStart = new Date(thisWeekStart)
    lastWeekStart.setDate(lastWeekStart.getDate() - 7)
    const lastWeekEnd = new Date(thisWeekEnd)
    lastWeekEnd.setDate(lastWeekEnd.getDate() - 7)

    // Filter sessions by week
    const thisWeekSessions = sessions.filter(s => isInWeek(s, thisWeekStart, thisWeekEnd))
    const lastWeekSessions = sessions.filter(s => isInWeek(s, lastWeekStart, lastWeekEnd))

    // Calculate stats for each week
    const thisWeek = {
      total: thisWeekSessions.length,
      complete: thisWeekSessions.filter(s => isSessionComplete(s)).length,
      missingCamera: thisWeekSessions.filter(s => !s.hasCameraVideo).length,
      missingAudio: thisWeekSessions.filter(s => !s.hasAudioRaw || !s.hasAudioClean).length,
    }

    const lastWeek = {
      total: lastWeekSessions.length,
      complete: lastWeekSessions.filter(s => isSessionComplete(s)).length,
      missingCamera: lastWeekSessions.filter(s => !s.hasCameraVideo).length,
      missingAudio: lastWeekSessions.filter(s => !s.hasAudioRaw || !s.hasAudioClean).length,
    }

    return {
      total: sessions.length,
      complete: sessions.filter((s) => isSessionComplete(s)).length,
      missingCamera: sessions.filter((s) => !s.hasCameraVideo).length,
      missingAudio: sessions.filter((s) => !s.hasAudioRaw || !s.hasAudioClean).length,
      favorites: sessions.filter((s) => s.metadata?.favorite === true).length,
      thisWeek,
      lastWeek,
    }
  }, [sessions])

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
          { label: orgDisplayName, href: `/${encodeURIComponent(decodedOrg)}` },
          { label: deviceDisplayName }
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
        { label: orgDisplayName, href: `/${encodeURIComponent(decodedOrg)}` },
        { label: deviceDisplayName }
      ]} />

      {/* Page Title with IDs shown if we have names */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold">{deviceDisplayName}</h1>
        {(orgName || deviceName) && (
          <p className="text-xs text-zinc-500 font-mono mt-1">
            {orgName ? `${decodedOrg} / ` : ''}{deviceName ? decodedDevice : ''}
          </p>
        )}
      </div>

      {/* Stats Bar */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-zinc-900 rounded-lg p-4 border border-zinc-800">
          <div className="text-2xl font-bold">{stats.total}</div>
          <div className="text-sm text-zinc-400">Total Sessions</div>
          <div className="text-[10px] text-zinc-600 mt-1">
            This week: {stats.thisWeek.total} · Last: {stats.lastWeek.total}
          </div>
        </div>
        <div className="bg-zinc-900 rounded-lg p-4 border border-zinc-800">
          <div className="text-2xl font-bold text-emerald-400">{stats.complete}</div>
          <div className="text-sm text-zinc-400">Complete</div>
          <div className="text-[10px] text-zinc-600 mt-1">
            This week: {stats.thisWeek.complete} · Last: {stats.lastWeek.complete}
          </div>
        </div>
        <div className="bg-zinc-900 rounded-lg p-4 border border-zinc-800">
          <div className="text-2xl font-bold text-amber-400">{stats.missingCamera}</div>
          <div className="text-sm text-zinc-400">Missing Camera</div>
          <div className="text-[10px] text-zinc-600 mt-1">
            This week: {stats.thisWeek.missingCamera} · Last: {stats.lastWeek.missingCamera}
          </div>
        </div>
        <div className="bg-zinc-900 rounded-lg p-4 border border-zinc-800">
          <div className="text-2xl font-bold text-red-400">{stats.missingAudio}</div>
          <div className="text-sm text-zinc-400">Missing Audio</div>
          <div className="text-[10px] text-zinc-600 mt-1">
            This week: {stats.thisWeek.missingAudio} · Last: {stats.lastWeek.missingAudio}
          </div>
        </div>
      </div>

      {sessions.length > 0 && (
        <SessionAnalytics
          sessions={sessions}
          onDateSelect={setDateFilter}
          selectedDate={dateFilter}
        />
      )}

      {/* Date filter banner */}
      {dateFilter && (
        <div className="flex items-center justify-between bg-blue-500/10 border border-blue-500/30 rounded-lg px-4 py-2 mb-4">
          <div className="flex items-center gap-2 text-sm">
            <svg className="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
            </svg>
            <span className="text-blue-300">
              Filtering by: <span className="font-medium">{(() => {
                const [year, month, day] = dateFilter.split('-').map(Number)
                const date = new Date(year, month - 1, day)
                return date.toLocaleDateString('en-US', {
                  weekday: 'short',
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })
              })()}</span>
            </span>
            <span className="text-blue-400/60">({filteredSessions.length} session{filteredSessions.length !== 1 ? 's' : ''})</span>
          </div>
          <button
            onClick={() => setDateFilter(null)}
            className="text-blue-400 hover:text-blue-300 text-sm flex items-center gap-1"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
            Clear filter
          </button>
        </div>
      )}

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
                    <div className="text-xs text-zinc-500 flex items-center gap-1">
                      <span>{session.year}-{session.month}-{session.day} {session.time.replace(/-/g, ':')} · {formatBytes(session.totalSize)}</span>
                      {durations[session.fullId] !== undefined ? (
                        <span className="text-zinc-400"> · {formatDuration(durations[session.fullId])}</span>
                      ) : session.hasScreenVideo ? (
                        <span className="text-zinc-600 inline-flex items-center gap-1">
                          <span> · </span>
                          <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                          </svg>
                        </span>
                      ) : null}
                      {/* Notes indicator */}
                      {noteCountsLoading.has(session.fullId) ? (
                        <span className="text-zinc-600 inline-flex items-center gap-1 ml-1">
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                          </svg>
                          <svg className="w-2.5 h-2.5 animate-spin" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                          </svg>
                        </span>
                      ) : noteCounts[session.fullId] > 0 ? (
                        <span className="text-blue-400 inline-flex items-center gap-0.5 ml-1">
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                          </svg>
                          <span className="text-[10px]">{noteCounts[session.fullId]}</span>
                        </span>
                      ) : null}
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
