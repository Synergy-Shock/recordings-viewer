'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { use } from 'react'
import Breadcrumb from '@/components/Breadcrumb'

interface DeviceWithMetadata {
  id: string
  name?: string
}

export default function DevicesPage({ params }: { params: Promise<{ org: string }> }) {
  const { org } = use(params)
  const decodedOrg = decodeURIComponent(org)

  const [devices, setDevices] = useState<DeviceWithMetadata[]>([])
  const [orgName, setOrgName] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchDevices() {
      try {
        const res = await fetch(`/api/orgs/${encodeURIComponent(decodedOrg)}/devices`)
        if (!res.ok) throw new Error('Failed to fetch devices')
        const data = await res.json()
        setDevices(data.devices)
        setOrgName(data.orgName || null)
      } catch (err) {
        setError(String(err))
      } finally {
        setLoading(false)
      }
    }
    fetchDevices()
  }, [decodedOrg])

  // Display name for the org (name if available, otherwise ID)
  const orgDisplayName = orgName || decodedOrg

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-80px)]">
        <div className="text-zinc-400">Loading devices...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-6">
        <Breadcrumb items={[
          { label: 'Organizations', href: '/' },
          { label: orgDisplayName }
        ]} />
        <div className="flex flex-col items-center justify-center h-[calc(100vh-200px)] gap-4">
          <div className="text-red-400">Error: {error}</div>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg"
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  if (devices.length === 0) {
    return (
      <div className="p-6">
        <Breadcrumb items={[
          { label: 'Organizations', href: '/' },
          { label: orgDisplayName }
        ]} />
        <div className="flex flex-col items-center justify-center h-[calc(100vh-200px)] gap-4">
          <div className="text-zinc-500">No devices found for this organization</div>
          <Link href="/" className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg">
            Back to Organizations
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6">
      <Breadcrumb items={[
        { label: 'Organizations', href: '/' },
        { label: orgDisplayName }
      ]} />

      <h1 className="text-2xl font-bold mb-1">{orgDisplayName}</h1>
      {orgName && (
        <p className="text-xs text-zinc-500 font-mono mb-2">{decodedOrg}</p>
      )}
      <p className="text-zinc-400 mb-6">Select a device to view its recordings.</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {devices.map((device) => (
          <Link
            key={device.id}
            href={`/${encodeURIComponent(decodedOrg)}/${encodeURIComponent(device.id)}`}
            className="bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded-lg p-6 transition-colors group"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-zinc-800 group-hover:bg-zinc-700 flex items-center justify-center transition-colors">
                <svg className="w-5 h-5 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>
              <div className="min-w-0 flex-1">
                {device.name ? (
                  <>
                    <div className="font-medium text-zinc-200 truncate">{device.name}</div>
                    <div className="text-xs text-zinc-500 font-mono truncate">{device.id}</div>
                  </>
                ) : (
                  <>
                    <div className="font-medium text-zinc-200 font-mono truncate">{device.id}</div>
                    <div className="text-xs text-zinc-500">Click to view sessions</div>
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
