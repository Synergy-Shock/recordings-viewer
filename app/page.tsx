'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'

interface OrgWithMetadata {
  id: string
  name?: string
}

export default function OrgsPage() {
  const [orgs, setOrgs] = useState<OrgWithMetadata[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchOrgs() {
      try {
        const res = await fetch('/api/orgs')
        if (!res.ok) throw new Error('Failed to fetch organizations')
        const data = await res.json()
        setOrgs(data.orgs)
      } catch (err) {
        setError(String(err))
      } finally {
        setLoading(false)
      }
    }
    fetchOrgs()
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-80px)]">
        <div className="text-zinc-400">Loading organizations...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-80px)] gap-4">
        <div className="text-red-400">Error: {error}</div>
        <button
          onClick={() => window.location.reload()}
          className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg"
        >
          Retry
        </button>
      </div>
    )
  }

  if (orgs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-80px)] gap-4">
        <div className="text-zinc-500">No organizations found</div>
        <p className="text-sm text-zinc-600 max-w-md text-center">
          The bucket appears to be empty or not using the expected format (ORG/DEVICE/session_id/...).
        </p>
      </div>
    )
  }

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-2">Organizations</h1>
      <p className="text-zinc-400 mb-6">Select an organization to view its devices and recordings.</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {orgs.map((org) => (
          <Link
            key={org.id}
            href={`/${encodeURIComponent(org.id)}`}
            className="bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded-lg p-6 transition-colors group"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-zinc-800 group-hover:bg-zinc-700 flex items-center justify-center transition-colors">
                <svg className="w-5 h-5 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
              </div>
              <div className="min-w-0 flex-1">
                {org.name ? (
                  <>
                    <div className="font-medium text-zinc-200 truncate">{org.name}</div>
                    <div className="text-xs text-zinc-500 font-mono truncate">{org.id}</div>
                  </>
                ) : (
                  <>
                    <div className="font-medium text-zinc-200 font-mono truncate">{org.id}</div>
                    <div className="text-xs text-zinc-500">Click to view devices</div>
                  </>
                )}
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
