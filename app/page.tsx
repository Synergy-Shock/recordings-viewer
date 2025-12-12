'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'

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

export default function Home() {
  const [sessions, setSessions] = useState<Session[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<'all' | 'complete' | 'incomplete'>('all')

  useEffect(() => {
    fetchSessions()
  }, [])

  async function fetchSessions() {
    try {
      setLoading(true)
      const res = await fetch('/api/sessions')
      if (!res.ok) throw new Error('Failed to fetch sessions')
      const data = await res.json()
      setSessions(data.sessions)
    } catch (err) {
      setError(String(err))
    } finally {
      setLoading(false)
    }
  }

  const filteredSessions = sessions.filter((session) => {
    const isComplete =
      session.hasScreenVideo &&
      session.hasScreenAudio &&
      session.hasCameraVideo &&
      session.hasAudioRaw &&
      session.hasAudioClean

    if (filter === 'complete') return isComplete
    if (filter === 'incomplete') return !isComplete
    return true
  })

  const stats = {
    total: sessions.length,
    complete: sessions.filter(
      (s) =>
        s.hasScreenVideo &&
        s.hasScreenAudio &&
        s.hasCameraVideo &&
        s.hasAudioRaw &&
        s.hasAudioClean
    ).length,
    missingCamera: sessions.filter((s) => !s.hasCameraVideo).length,
    missingAudio: sessions.filter((s) => !s.hasAudioRaw || !s.hasAudioClean).length,
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-80px)]">
        <div className="text-zinc-400">Loading sessions...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-80px)] gap-4">
        <div className="text-red-400">Error: {error}</div>
        <button
          onClick={fetchSessions}
          className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg"
        >
          Retry
        </button>
      </div>
    )
  }

  return (
    <div className="p-6">
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

      {/* Filter Tabs */}
      <div className="flex gap-2 mb-4">
        {(['all', 'complete', 'incomplete'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              filter === f
                ? 'bg-zinc-100 text-zinc-900'
                : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
            }`}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
            {f === 'all' && ` (${sessions.length})`}
            {f === 'complete' && ` (${stats.complete})`}
            {f === 'incomplete' && ` (${sessions.length - stats.complete})`}
          </button>
        ))}
        <button
          onClick={fetchSessions}
          className="ml-auto px-4 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-sm"
        >
          ↻ Refresh
        </button>
      </div>

      {/* Sessions List */}
      <div className="space-y-2">
        {filteredSessions.length === 0 ? (
          <div className="text-center py-12 text-zinc-500">
            No sessions found
          </div>
        ) : (
          filteredSessions.map((session) => (
            <Link
              key={session.id}
              href={`/session/${session.id}`}
              className="block bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded-lg p-4 transition-colors"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div>
                    <div className="font-mono text-sm text-zinc-300">
                      {session.id}
                    </div>
                    <div className="text-xs text-zinc-500">
                      {formatDate(session.timestamp)} · {formatBytes(session.totalSize)}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <FileIndicator present={session.hasScreenVideo} label="Screen" />
                  <FileIndicator present={session.hasCameraVideo} label="Camera" />
                  <FileIndicator
                    present={session.hasAudioRaw && session.hasAudioClean}
                    label="Audio"
                  />
                </div>
              </div>
            </Link>
          ))
        )}
      </div>
    </div>
  )
}
