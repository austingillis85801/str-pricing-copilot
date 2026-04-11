'use client'

import { useState, useEffect, useCallback } from 'react'
import type {
  RulesEngineOutput,
  Property,
  CalendarData,
} from '@/lib/types'
import { CalendarView } from '@/components/calendar-view'
import type { SelectedDate } from '@/components/calendar-view'
import { DateSlideOver } from '@/components/date-slide-over'
import { AIRecommendationPanel } from '@/components/ai-recommendation-panel'

function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`bg-slate-700/50 rounded animate-pulse ${className}`} />
}

function CalendarSkeleton() {
  return (
    <div className="p-6 md:p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Skeleton className="h-7 w-64 mb-2" />
          <Skeleton className="h-4 w-48" />
        </div>
        <Skeleton className="h-9 w-36 rounded-lg" />
      </div>
      <Skeleton className="h-96 rounded-xl" />
    </div>
  )
}

export default function BearLakeCalendarPage() {
  const [property, setProperty] = useState<Property | null>(null)
  const [rulesOutput, setRulesOutput] = useState<RulesEngineOutput | null>(null)
  const [calendarData, setCalendarData] = useState<CalendarData | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [selectedDate, setSelectedDate] = useState<SelectedDate | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function init() {
      try {
        const propsRes = await fetch('/api/properties')
        if (!propsRes.ok) throw new Error('Could not load properties')
        const props: Property[] = await propsRes.json()
        const bearLake = props.find(
          (p) =>
            p.name.toLowerCase().includes('bear') ||
            p.location.toLowerCase().includes('bear lake')
        )
        if (!bearLake) {
          setError('Bear Lake property not found. Set it up in Settings.')
          setLoading(false)
          return
        }
        setProperty(bearLake)

        const [rulesRes, calRes] = await Promise.all([
          fetch('/api/rules-engine', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ property_id: bearLake.id }),
          }),
          fetch(`/api/calendar-data?property_id=${bearLake.id}`),
        ])

        if (rulesRes.ok) setRulesOutput(await rulesRes.json())
        if (calRes.ok) setCalendarData(await calRes.json())
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load calendar data')
      } finally {
        setLoading(false)
      }
    }
    init()
  }, [])

  const handleRefresh = useCallback(async () => {
    if (!property || refreshing) return
    setRefreshing(true)
    try {
      const [rulesRes, calRes] = await Promise.all([
        fetch('/api/rules-engine', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ property_id: property.id }),
        }),
        fetch(`/api/calendar-data?property_id=${property.id}`),
      ])
      if (rulesRes.ok) setRulesOutput(await rulesRes.json())
      if (calRes.ok) setCalendarData(await calRes.json())
    } finally {
      setRefreshing(false)
    }
  }, [property, refreshing])

  if (loading) return <CalendarSkeleton />

  if (error) {
    return (
      <div className="p-6 md:p-8">
        <div className="bg-red-900/20 border border-red-500/40 rounded-xl p-6 text-center">
          <p className="text-red-300 font-medium">{error}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 md:p-8 space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-white">Calendar — Bear Lake</h1>
          <p className="text-slate-400 mt-1">Bear Lake / Garden City, UT · Airbnb &amp; Vrbo</p>
          {rulesOutput && (
            <p className="text-slate-500 text-xs mt-1">
              {Math.round(rulesOutput.occupancy_pct_this_month)}% occupied this month ·{' '}
              {rulesOutput.open_dates.filter((d) => d.alert_level === 'action').length} action alerts
            </p>
          )}
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="flex items-center gap-2 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors shrink-0"
        >
          {refreshing ? (
            <>
              <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Refreshing…
            </>
          ) : (
            <>
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Refresh Analysis
            </>
          )}
        </button>
      </div>

      {/* Calendar Grid */}
      <CalendarView
        rulesOutput={rulesOutput}
        bookings={calendarData?.bookings ?? []}
        entries={calendarData?.entries ?? []}
        events={calendarData?.events ?? []}
        slug="bear-lake"
        onSelectDate={setSelectedDate}
        selectedDateStr={selectedDate?.dateStr ?? null}
      />

      {/* AI Recommendation Panel */}
      {property && (
        <AIRecommendationPanel
          rulesOutput={rulesOutput}
          propertyId={property.id}
        />
      )}

      {/* Date Detail Slide-Over */}
      <DateSlideOver
        selected={selectedDate}
        rulesOutput={rulesOutput}
        propertyId={property?.id ?? null}
        slug="bear-lake"
        onClose={() => setSelectedDate(null)}
      />
    </div>
  )
}
