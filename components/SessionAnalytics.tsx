'use client'

import { useState, useMemo, useEffect } from 'react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'


// Types
interface Session {
  id: string
  fullId: string
  year: string
  month: string
  day: string
  time: string
  hasScreenVideo: boolean
  hasScreenAudio: boolean
  hasCameraVideo: boolean
  hasAudioRaw: boolean
  hasAudioClean: boolean
}

type ViewMode = 'day' | 'week' | 'month'

interface SessionAnalyticsProps {
  sessions: Session[]
  onDateSelect: (date: string | null) => void
  selectedDate: string | null
}

// LocalStorage keys
const ANALYTICS_EXPANDED_KEY = 'recordings-viewer-analytics-expanded'
const ANALYTICS_VIEW_KEY = 'recordings-viewer-analytics-view'

// Helper functions
function isSessionComplete(session: Session): boolean {
  return (
    session.hasScreenVideo &&
    session.hasScreenAudio &&
    session.hasCameraVideo &&
    session.hasAudioRaw &&
    session.hasAudioClean
  )
}

function getDateKey(year: string, month: string, day: string): string {
  return `${year}-${month}-${day}`
}

function formatDateDisplay(dateKey: string): string {
  const [year, month, day] = dateKey.split('-').map(Number)
  const date = new Date(year, month - 1, day)
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)

  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  const yesterdayKey = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`

  if (dateKey === todayKey) return 'Today'
  if (dateKey === yesterdayKey) return 'Yesterday'

  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
}

function getWeekDates(referenceDate: Date): string[] {
  const dates: string[] = []
  const day = referenceDate.getDay()
  // Adjust for Monday start (0 = Sunday, so Monday = 1)
  const mondayOffset = day === 0 ? -6 : 1 - day
  const monday = new Date(referenceDate)
  monday.setDate(monday.getDate() + mondayOffset)

  for (let i = 0; i < 7; i++) {
    const d = new Date(monday)
    d.setDate(d.getDate() + i)
    dates.push(
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    )
  }
  return dates
}

function getMonthDates(year: number, month: number): string[][] {
  const weeks: string[][] = []
  const firstDay = new Date(year, month, 1)
  const lastDay = new Date(year, month + 1, 0)

  // Find the Monday of the first week
  let current = new Date(firstDay)
  const dayOfWeek = current.getDay()
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek
  current.setDate(current.getDate() + mondayOffset)

  // Generate weeks until we pass the last day of the month
  while (current <= lastDay || weeks.length === 0) {
    const week: string[] = []
    for (let i = 0; i < 7; i++) {
      week.push(
        `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}-${String(current.getDate()).padStart(2, '0')}`
      )
      current.setDate(current.getDate() + 1)
    }
    weeks.push(week)
    // Stop if we've passed the month
    if (current.getMonth() !== month && current > lastDay) break
  }

  return weeks
}

// Custom tooltip for charts
function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload || !payload.length) return null

  const data = payload[0].payload
  return (
    <div className="bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-xs shadow-lg">
      <div className="font-medium text-zinc-200">{data.label || label}</div>
      <div className="text-zinc-400 mt-1">
        {data.total} session{data.total !== 1 ? 's' : ''}
      </div>
      <div className="flex gap-3 mt-1">
        <span className="text-emerald-400">{data.complete} complete</span>
        <span className="text-amber-400">{data.incomplete} incomplete</span>
      </div>
    </div>
  )
}

// Day View Chart
function DayViewChart({
  sessions,
  selectedDate,
  onDateSelect,
  onHourClick,
}: {
  sessions: Session[]
  selectedDate: string
  onDateSelect: (date: string) => void
  onHourClick: (hour: number | null) => void
}) {
  const hourData = useMemo(() => {
    const hours = Array.from({ length: 24 }, (_, i) => ({
      hour: i,
      label: `${i}:00`,
      total: 0,
      complete: 0,
      incomplete: 0,
    }))

    for (const session of sessions) {
      const sessionDate = getDateKey(session.year, session.month, session.day)
      if (sessionDate !== selectedDate) continue

      const hour = parseInt(session.time.split('-')[0], 10)
      hours[hour].total++
      if (isSessionComplete(session)) {
        hours[hour].complete++
      } else {
        hours[hour].incomplete++
      }
    }

    return hours
  }, [sessions, selectedDate])

  const earliestDate = useMemo(() => {
    if (sessions.length === 0) return selectedDate
    const dates = sessions.map((s) => getDateKey(s.year, s.month, s.day))
    return dates.sort()[0]
  }, [sessions, selectedDate])

  const today = new Date()
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`

  const navigateDay = (direction: 'prev' | 'next') => {
    const [year, month, day] = selectedDate.split('-').map(Number)
    const current = new Date(year, month - 1, day)
    current.setDate(current.getDate() + (direction === 'next' ? 1 : -1))
    const newKey = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}-${String(current.getDate()).padStart(2, '0')}`
    onDateSelect(newKey)
  }

  const totalForDay = hourData.reduce((sum, h) => sum + h.total, 0)

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigateDay('prev')}
            disabled={selectedDate <= earliestDate}
            className="p-1 rounded bg-zinc-800 text-zinc-400 hover:bg-zinc-700 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <span className="text-sm text-zinc-300 min-w-[120px] text-center font-medium">
            {formatDateDisplay(selectedDate)}
          </span>
          <button
            onClick={() => navigateDay('next')}
            disabled={selectedDate >= todayKey}
            className="p-1 rounded bg-zinc-800 text-zinc-400 hover:bg-zinc-700 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
        <span className="text-xs text-zinc-500">
          {totalForDay} session{totalForDay !== 1 ? 's' : ''}
        </span>
      </div>

      <div className="h-40">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={hourData} onClick={(e) => {
              const data = e as unknown as { activePayload?: Array<{ payload: { hour: number } }> }
              if (data?.activePayload?.[0]) {
                onHourClick(data.activePayload[0].payload.hour)
              }
            }}>
            <XAxis
              dataKey="hour"
              tick={{ fill: '#71717a', fontSize: 10 }}
              tickLine={false}
              axisLine={false}
              interval={2}
            />
            <YAxis hide />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.05)' }} />
            <Bar dataKey="complete" stackId="a" fill="#10b981" radius={[0, 0, 0, 0]} />
            <Bar dataKey="incomplete" stackId="a" fill="#f59e0b" radius={[2, 2, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="flex items-center justify-end mt-2 gap-4 text-xs text-zinc-500">
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 bg-emerald-500 rounded" />
          <span>Complete</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 bg-amber-500 rounded" />
          <span>Incomplete</span>
        </div>
      </div>
    </div>
  )
}

// Week View Chart
function WeekViewChart({
  sessions,
  referenceDate,
  onWeekChange,
  onDayClick,
}: {
  sessions: Session[]
  referenceDate: Date
  onWeekChange: (date: Date) => void
  onDayClick: (dateKey: string) => void
}) {
  const weekDates = useMemo(() => getWeekDates(referenceDate), [referenceDate])

  const dayData = useMemo(() => {
    const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

    return weekDates.map((dateKey, i) => {
      const [year, month, day] = dateKey.split('-')
      const sessionsForDay = sessions.filter(
        (s) => s.year === year && s.month === month && s.day === day
      )

      return {
        dateKey,
        label: dayNames[i],
        fullLabel: `${dayNames[i]} ${parseInt(day)}`,
        total: sessionsForDay.length,
        complete: sessionsForDay.filter(isSessionComplete).length,
        incomplete: sessionsForDay.filter((s) => !isSessionComplete(s)).length,
      }
    })
  }, [sessions, weekDates])

  const navigateWeek = (direction: 'prev' | 'next') => {
    const newDate = new Date(referenceDate)
    newDate.setDate(newDate.getDate() + (direction === 'next' ? 7 : -7))
    onWeekChange(newDate)
  }

  const weekStart = weekDates[0]
  const weekEnd = weekDates[6]
  const [startYear, startMonth, startDay] = weekStart.split('-').map(Number)
  const [endYear, endMonth, endDay] = weekEnd.split('-').map(Number)

  const startDate = new Date(startYear, startMonth - 1, startDay)
  const endDate = new Date(endYear, endMonth - 1, endDay)

  const weekLabel = `${startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${endDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`

  const totalForWeek = dayData.reduce((sum, d) => sum + d.total, 0)

  // Check if we can go forward (don't go past current week)
  const today = new Date()
  const currentWeekDates = getWeekDates(today)
  const canGoForward = weekEnd < currentWeekDates[6]

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigateWeek('prev')}
            className="p-1 rounded bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <span className="text-sm text-zinc-300 min-w-[180px] text-center font-medium">
            {weekLabel}
          </span>
          <button
            onClick={() => navigateWeek('next')}
            disabled={!canGoForward}
            className="p-1 rounded bg-zinc-800 text-zinc-400 hover:bg-zinc-700 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
        <span className="text-xs text-zinc-500">
          {totalForWeek} session{totalForWeek !== 1 ? 's' : ''}
        </span>
      </div>

      <div className="h-40">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={dayData} onClick={(e) => {
              const data = e as unknown as { activePayload?: Array<{ payload: { dateKey: string } }> }
              if (data?.activePayload?.[0]) {
                onDayClick(data.activePayload[0].payload.dateKey)
              }
            }}>
            <XAxis
              dataKey="label"
              tick={{ fill: '#71717a', fontSize: 11 }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis hide />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.05)' }} />
            <Bar dataKey="complete" stackId="a" fill="#10b981" radius={[0, 0, 0, 0]} />
            <Bar dataKey="incomplete" stackId="a" fill="#f59e0b" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="flex items-center justify-end mt-2 gap-4 text-xs text-zinc-500">
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 bg-emerald-500 rounded" />
          <span>Complete</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 bg-amber-500 rounded" />
          <span>Incomplete</span>
        </div>
      </div>
    </div>
  )
}

// Month Heatmap View
function MonthHeatmapView({
  sessions,
  year,
  month,
  onMonthChange,
  onDayClick,
}: {
  sessions: Session[]
  year: number
  month: number
  onMonthChange: (year: number, month: number) => void
  onDayClick: (dateKey: string) => void
}) {
  const weeks = useMemo(() => getMonthDates(year, month), [year, month])

  const sessionsByDate = useMemo(() => {
    const map: Record<string, { total: number; complete: number }> = {}
    for (const session of sessions) {
      const key = getDateKey(session.year, session.month, session.day)
      if (!map[key]) {
        map[key] = { total: 0, complete: 0 }
      }
      map[key].total++
      if (isSessionComplete(session)) {
        map[key].complete++
      }
    }
    return map
  }, [sessions])

  const maxSessions = useMemo(() => {
    return Math.max(...Object.values(sessionsByDate).map((d) => d.total), 1)
  }, [sessionsByDate])

  const navigateMonth = (direction: 'prev' | 'next') => {
    let newYear = year
    let newMonth = month + (direction === 'next' ? 1 : -1)
    if (newMonth > 11) {
      newMonth = 0
      newYear++
    } else if (newMonth < 0) {
      newMonth = 11
      newYear--
    }
    onMonthChange(newYear, newMonth)
  }

  const monthLabel = new Date(year, month).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  })

  // Check if we can go forward
  const today = new Date()
  const canGoForward = year < today.getFullYear() || (year === today.getFullYear() && month < today.getMonth())

  const totalForMonth = Object.values(sessionsByDate).reduce((sum, d) => sum + d.total, 0)

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigateMonth('prev')}
            className="p-1 rounded bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <span className="text-sm text-zinc-300 min-w-[140px] text-center font-medium">
            {monthLabel}
          </span>
          <button
            onClick={() => navigateMonth('next')}
            disabled={!canGoForward}
            className="p-1 rounded bg-zinc-800 text-zinc-400 hover:bg-zinc-700 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
        <span className="text-xs text-zinc-500">
          {totalForMonth} session{totalForMonth !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Calendar header */}
      <div className="grid grid-cols-7 gap-1 mb-1">
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => (
          <div key={day} className="text-center text-[10px] text-zinc-500 py-1">
            {day}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="space-y-1">
        {weeks.map((week, weekIndex) => (
          <div key={weekIndex} className="grid grid-cols-7 gap-1">
            {week.map((dateKey) => {
              const [y, m, d] = dateKey.split('-').map(Number)
              const isCurrentMonth = m - 1 === month
              const data = sessionsByDate[dateKey]
              const intensity = data ? data.total / maxSessions : 0

              return (
                <button
                  key={dateKey}
                  onClick={() => data?.total > 0 && onDayClick(dateKey)}
                  disabled={!data?.total}
                  className={`
                    aspect-square rounded text-[10px] flex items-center justify-center transition-colors
                    ${isCurrentMonth ? 'text-zinc-300' : 'text-zinc-600'}
                    ${data?.total > 0 ? 'cursor-pointer hover:ring-1 hover:ring-zinc-500' : 'cursor-default'}
                  `}
                  style={{
                    backgroundColor: data?.total
                      ? `rgba(16, 185, 129, ${0.2 + intensity * 0.6})`
                      : isCurrentMonth
                      ? 'rgba(63, 63, 70, 0.3)'
                      : 'transparent',
                  }}
                  title={data?.total ? `${data.total} sessions (${data.complete} complete)` : undefined}
                >
                  {d}
                </button>
              )
            })}
          </div>
        ))}
      </div>

      {/* Legend */}
      <div className="flex items-center justify-end mt-3 gap-1 text-xs text-zinc-500">
        <span>Less</span>
        {[0.2, 0.4, 0.6, 0.8].map((opacity) => (
          <div
            key={opacity}
            className="w-3 h-3 rounded"
            style={{ backgroundColor: `rgba(16, 185, 129, ${opacity})` }}
          />
        ))}
        <span>More</span>
      </div>
    </div>
  )
}

// Main Analytics Component
export default function SessionAnalytics({
  sessions,
  onDateSelect,
  selectedDate,
}: SessionAnalyticsProps) {
  // Load preferences from localStorage
  const [isExpanded, setIsExpanded] = useState(() => {
    if (typeof window === 'undefined') return true
    const saved = localStorage.getItem(ANALYTICS_EXPANDED_KEY)
    return saved !== null ? saved === 'true' : true
  })

  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    if (typeof window === 'undefined') return 'day'
    const saved = localStorage.getItem(ANALYTICS_VIEW_KEY) as ViewMode
    return saved || 'day'
  })

  // State for each view's navigation
  const today = new Date()
  const [dayViewDate, setDayViewDate] = useState(() => {
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  })
  const [weekViewDate, setWeekViewDate] = useState(today)
  const [monthViewYear, setMonthViewYear] = useState(today.getFullYear())
  const [monthViewMonth, setMonthViewMonth] = useState(today.getMonth())

  // Save preferences
  useEffect(() => {
    localStorage.setItem(ANALYTICS_EXPANDED_KEY, String(isExpanded))
  }, [isExpanded])

  useEffect(() => {
    localStorage.setItem(ANALYTICS_VIEW_KEY, viewMode)
  }, [viewMode])

  const handleDaySelect = (dateKey: string) => {
    onDateSelect(dateKey)
    setDayViewDate(dateKey)
    setViewMode('day')
  }

  const handleHourClick = (hour: number | null) => {
    // For now, just select the day - hour filtering could be added later
    onDateSelect(dayViewDate)
  }

  return (
    <div className="bg-zinc-900 rounded-lg border border-zinc-800 mb-6">
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between p-4 hover:bg-zinc-800/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
          <span className="text-sm font-medium text-zinc-300">Analytics</span>
        </div>
        <svg
          className={`w-4 h-4 text-zinc-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Content */}
      {isExpanded && (
        <div className="px-4 pb-4">
          {/* View mode tabs */}
          <div className="flex gap-1 mb-4">
            {(['day', 'week', 'month'] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                  viewMode === mode
                    ? 'bg-zinc-700 text-zinc-100'
                    : 'text-zinc-400 hover:text-zinc-300 hover:bg-zinc-800'
                }`}
              >
                {mode.charAt(0).toUpperCase() + mode.slice(1)}
              </button>
            ))}
          </div>

          {/* Chart views */}
          {viewMode === 'day' && (
            <DayViewChart
              sessions={sessions}
              selectedDate={dayViewDate}
              onDateSelect={setDayViewDate}
              onHourClick={handleHourClick}
            />
          )}
          {viewMode === 'week' && (
            <WeekViewChart
              sessions={sessions}
              referenceDate={weekViewDate}
              onWeekChange={setWeekViewDate}
              onDayClick={handleDaySelect}
            />
          )}
          {viewMode === 'month' && (
            <MonthHeatmapView
              sessions={sessions}
              year={monthViewYear}
              month={monthViewMonth}
              onMonthChange={(y, m) => {
                setMonthViewYear(y)
                setMonthViewMonth(m)
              }}
              onDayClick={handleDaySelect}
            />
          )}
        </div>
      )}
    </div>
  )
}
