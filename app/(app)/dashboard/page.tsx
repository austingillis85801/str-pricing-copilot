'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import type { RulesEngineOutput, WeatherFlag, WeatherFlagType, BookingStats } from '@/lib/types'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)
}

function fmtDate(dateStr: string) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  })
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`bg-slate-700/50 rounded animate-pulse ${className}`} />
}

function DashboardSkeleton() {
  return (
    <div className="p-6 md:p-8 space-y-8">
      <div>
        <Skeleton className="h-7 w-40 mb-2" />
        <Skeleton className="h-4 w-64" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Skeleton className="h-44 rounded-xl" />
        <Skeleton className="h-44 rounded-xl" />
      </div>
      <Skeleton className="h-64 rounded-xl" />
      <Skeleton className="h-48 rounded-xl" />
    </div>
  )
}

// ─── Weather color map ────────────────────────────────────────────────────────

const WEATHER_COLORS: Record<WeatherFlagType, string> = {
  flash_flood_risk: 'border-red-500 bg-red-500/10 text-red-400',
  heat_friction: 'border-orange-500 bg-orange-500/10 text-orange-400',
  demand_boost: 'border-blue-500 bg-blue-500/10 text-blue-400',
  demand_softness: 'border-yellow-500 bg-yellow-500/10 text-yellow-400',
  snow_opportunity: 'border-sky-400 bg-sky-400/10 text-sky-300',
  memorial_day_risk: 'border-amber-500 bg-amber-500/10 text-amber-400',
}

// ─── Property Summary Card ─────────────────────────────────────────────────────

function PropertyCard({
  output,
  stats,
}: {
  output: RulesEngineOutput
  stats: BookingStats | undefined
}) {
  const occ = output.occupancy_pct_this_month
  const occColor = occ >= 70 ? 'text-emerald-400' : occ >= 50 ? 'text-yellow-400' : 'text-red-400'
  const barColor = occ >= 70 ? 'bg-emerald-500' : occ >= 50 ? 'bg-yellow-500' : 'bg-red-500'

  const firstOpen = output.open_dates[0]
  const nextEvent = output.upcoming_events[0]
  const isMoab = output.property_name.toLowerCase().includes('moab')
  const calendarHref = isMoab ? '/calendar/moab' : '/calendar/bear-lake'

  return (
    <Link href={calendarHref} className="block">
      <div className="bg-slate-800 border border-slate-700 rounded-xl p-5 hover:border-slate-600 transition-colors">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="text-white font-semibold text-base">{output.property_name}</h3>
            <p className="text-slate-400 text-xs mt-0.5">
              {isMoab ? 'Moab, UT' : 'Bear Lake / Garden City, UT'}
            </p>
          </div>
          <span
            className={`text-xs font-semibold px-2 py-1 rounded-full ${
              occ >= 70
                ? 'bg-emerald-500/15 text-emerald-400'
                : occ >= 50
                ? 'bg-yellow-500/15 text-yellow-400'
                : 'bg-red-500/15 text-red-400'
            }`}
          >
            {Math.round(occ)}% occ.
          </span>
        </div>

        {/* Occupancy bar */}
        <div className="mb-4">
          <div className="flex justify-between text-xs text-slate-400 mb-1">
            <span>This month occupancy</span>
            <span className={occColor}>{Math.round(occ)}%</span>
          </div>
          <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${barColor}`}
              style={{ width: `${Math.min(occ, 100)}%` }}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-slate-500 text-xs">Revenue this month</p>
            <p className="text-white font-medium mt-0.5">
              {stats ? fmt(stats.this_month_revenue) : '—'}
            </p>
          </div>
          <div>
            <p className="text-slate-500 text-xs">Next open date</p>
            <p className="text-white font-medium mt-0.5">
              {firstOpen ? fmtDate(firstOpen.date) : 'All booked'}
            </p>
          </div>
          {nextEvent && (
            <div className="col-span-2">
              <p className="text-slate-500 text-xs">Next demand event</p>
              <p className="text-white font-medium mt-0.5">
                {nextEvent.name}{' '}
                <span className="text-slate-400 font-normal">({nextEvent.days_until}d away)</span>
              </p>
            </div>
          )}
        </div>
      </div>
    </Link>
  )
}

// ─── Action Alert Card ────────────────────────────────────────────────────────

function ActionCard({
  alert,
  propertyName,
  propertyId,
  onDismiss,
}: {
  alert: {
    date: string
    days_until_checkin: number
    alert_level: 'action' | 'watch' | null
    suggested_discount: number
    recommended_price_low: number
    recommended_price_high: number
    event_name?: string
    is_weekend: boolean
  }
  propertyName: string
  propertyId: string
  onDismiss: (key: string) => void
}) {
  const isMoab = propertyName.toLowerCase().includes('moab')
  const calendarHref = isMoab ? '/calendar/moab' : '/calendar/bear-lake'
  const key = `${propertyId}-${alert.date}`

  return (
    <div className="bg-slate-800 border border-red-500/40 rounded-xl p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="text-xs font-semibold bg-red-500/20 text-red-400 px-2 py-0.5 rounded-full">
              ACTION
            </span>
            <span className="text-slate-400 text-xs">{propertyName}</span>
            {alert.is_weekend && (
              <span className="text-xs bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded-full">
                Weekend
              </span>
            )}
          </div>
          <p className="text-white font-medium text-sm">
            {fmtDate(alert.date)}{' '}
            <span className="text-slate-400 font-normal">· {alert.days_until_checkin} days away</span>
          </p>
          {alert.event_name && (
            <p className="text-slate-400 text-xs mt-0.5">{alert.event_name}</p>
          )}
          <p className="text-slate-300 text-xs mt-1">
            Suggested:{' '}
            <span className="text-white font-medium">
              {fmt(alert.recommended_price_low)}–{fmt(alert.recommended_price_high)}
            </span>
            {alert.suggested_discount > 0 && (
              <span className="text-amber-400 ml-1">({alert.suggested_discount}% off base)</span>
            )}
          </p>
        </div>
        <div className="flex flex-col gap-2 shrink-0">
          <Link
            href={calendarHref}
            className="text-xs bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded-lg transition-colors text-center"
          >
            View
          </Link>
          <button
            onClick={() => onDismiss(key)}
            className="text-xs text-slate-400 hover:text-white px-3 py-1.5 rounded-lg border border-slate-600 hover:border-slate-500 transition-colors"
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Booking Pace Chart (CSS bars) ────────────────────────────────────────────

function BookingPaceChart({
  outputs,
  stats,
}: {
  outputs: RulesEngineOutput[]
  stats: Record<string, BookingStats>
}) {
  const monthName = new Date().toLocaleDateString('en-US', { month: 'long' })

  const totals = outputs.reduce(
    (acc, o) => {
      const s = stats[o.property_id]
      if (!s) return acc
      return {
        thisRevenue: acc.thisRevenue + s.this_month_revenue,
        lastRevenue: acc.lastRevenue + s.last_year_revenue,
        thisBookings: acc.thisBookings + s.this_month_bookings,
        lastBookings: acc.lastBookings + s.last_year_bookings,
      }
    },
    { thisRevenue: 0, lastRevenue: 0, thisBookings: 0, lastBookings: 0 }
  )

  const maxRevenue = Math.max(totals.thisRevenue, totals.lastRevenue, 1)
  const maxBookings = Math.max(totals.thisBookings, totals.lastBookings, 1)

  return (
    <div className="bg-slate-800 border border-slate-700 rounded-xl p-5">
      <h3 className="text-white font-semibold mb-4">
        Booking Pace — {monthName}
      </h3>
      <div className="space-y-5">
        {/* Bookings */}
        <div>
          <div className="flex justify-between text-xs text-slate-400 mb-2">
            <span>Bookings (check-ins this month)</span>
            <span>
              {totals.thisBookings} this year · {totals.lastBookings} last year
            </span>
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center gap-3">
              <span className="w-20 text-xs text-slate-400 shrink-0">This year</span>
              <div className="flex-1 h-3 bg-slate-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-500 rounded-full transition-all duration-700"
                  style={{ width: `${(totals.thisBookings / maxBookings) * 100}%` }}
                />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="w-20 text-xs text-slate-400 shrink-0">Last year</span>
              <div className="flex-1 h-3 bg-slate-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-slate-500 rounded-full transition-all duration-700"
                  style={{ width: `${(totals.lastBookings / maxBookings) * 100}%` }}
                />
              </div>
            </div>
          </div>
        </div>
        {/* Revenue */}
        <div>
          <div className="flex justify-between text-xs text-slate-400 mb-2">
            <span>Revenue (check-ins this month)</span>
            <span>
              {fmt(totals.thisRevenue)} this year · {fmt(totals.lastRevenue)} last year
            </span>
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center gap-3">
              <span className="w-20 text-xs text-slate-400 shrink-0">This year</span>
              <div className="flex-1 h-3 bg-slate-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-500 rounded-full transition-all duration-700"
                  style={{ width: `${(totals.thisRevenue / maxRevenue) * 100}%` }}
                />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="w-20 text-xs text-slate-400 shrink-0">Last year</span>
              <div className="flex-1 h-3 bg-slate-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-slate-500 rounded-full transition-all duration-700"
                  style={{ width: `${(totals.lastRevenue / maxRevenue) * 100}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Main Dashboard ────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const [rulesOutputs, setRulesOutputs] = useState<RulesEngineOutput[] | null>(null)
  const [weatherFlags, setWeatherFlags] = useState<WeatherFlag[] | null>(null)
  const [bookingStats, setBookingStats] = useState<Record<string, BookingStats> | null>(null)
  const [loading, setLoading] = useState(true)
  const [dismissedAlerts, setDismissedAlerts] = useState<Set<string>>(new Set())
  const [dismissedWeather, setDismissedWeather] = useState<Set<string>>(new Set())
  const [dismissedJanuary, setDismissedJanuary] = useState(false)

  useEffect(() => {
    // Restore dismissed alerts from localStorage
    try {
      const stored = localStorage.getItem('dismissed_alerts')
      if (stored) {
        const { alerts, weather, expiry } = JSON.parse(stored)
        if (expiry && Date.now() < expiry) {
          setDismissedAlerts(new Set(alerts ?? []))
          setDismissedWeather(new Set(weather ?? []))
        }
      }
    } catch {
      // ignore
    }
  }, [])

  const saveDismissed = useCallback(
    (alerts: Set<string>, weather: Set<string>) => {
      try {
        localStorage.setItem(
          'dismissed_alerts',
          JSON.stringify({
            alerts: Array.from(alerts),
            weather: Array.from(weather),
            expiry: Date.now() + 48 * 60 * 60 * 1000, // 48 hours
          })
        )
      } catch {
        // ignore
      }
    },
    []
  )

  const dismissAlert = useCallback(
    (key: string) => {
      setDismissedAlerts((prev) => {
        const next = new Set(prev)
        next.add(key)
        saveDismissed(next, dismissedWeather)
        return next
      })
    },
    [dismissedWeather, saveDismissed]
  )

  const dismissWeather = useCallback(
    (key: string) => {
      setDismissedWeather((prev) => {
        const next = new Set(prev)
        next.add(key)
        saveDismissed(dismissedAlerts, next)
        return next
      })
    },
    [dismissedAlerts, saveDismissed]
  )

  useEffect(() => {
    async function load() {
      try {
        const [rulesRes, weatherRes, statsRes] = await Promise.all([
          fetch('/api/rules-engine/all', { method: 'POST' }),
          fetch('/api/weather'),
          fetch('/api/bookings/stats'),
        ])
        if (rulesRes.ok) setRulesOutputs(await rulesRes.json())
        if (weatherRes.ok) setWeatherFlags(await weatherRes.json())
        if (statsRes.ok) setBookingStats(await statsRes.json())
      } catch {
        // ignore — empty states handle missing data gracefully
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const isJanuary = new Date().getMonth() === 0

  if (loading) {
    return <DashboardSkeleton />
  }

  // Build action alerts from all properties
  type ActionAlert = {
    date: string
    days_until_checkin: number
    alert_level: 'action' | 'watch' | null
    suggested_discount: number
    recommended_price_low: number
    recommended_price_high: number
    event_name?: string
    is_weekend: boolean
    property_name: string
    property_id: string
  }

  const allActions: ActionAlert[] = (rulesOutputs ?? []).flatMap((o) =>
    o.open_dates
      .filter((d) => d.alert_level === 'action')
      .map((d) => ({ ...d, property_name: o.property_name, property_id: o.property_id }))
  )

  const topActions = allActions
    .filter((a) => !dismissedAlerts.has(`${a.property_id}-${a.date}`))
    .sort((a, b) => a.days_until_checkin - b.days_until_checkin)
    .slice(0, 8)

  // Upcoming events next 60 days (de-duped by id)
  const eventMap = new Map<string, { id: string; name: string; event_date: string; end_date?: string | null; days_until: number; multiplier: number; property_name: string }>()
  for (const o of rulesOutputs ?? []) {
    for (const e of o.upcoming_events) {
      if (e.days_until <= 60 && !eventMap.has(e.id)) {
        eventMap.set(e.id, { ...e, property_name: o.property_name })
      }
    }
  }
  const upcomingEvents = Array.from(eventMap.values()).sort((a, b) => a.days_until - b.days_until)

  // Group events by week
  const eventsByWeek = new Map<string, typeof upcomingEvents>()
  for (const e of upcomingEvents) {
    const d = new Date(e.event_date + 'T00:00:00')
    const weekStart = new Date(d)
    weekStart.setDate(d.getDate() - d.getDay())
    const key = weekStart.toISOString().split('T')[0]
    if (!eventsByWeek.has(key)) eventsByWeek.set(key, [])
    eventsByWeek.get(key)!.push(e)
  }

  // Special windows across all properties (de-duped by name)
  const windowMap = new Map<string, { name: string; start_date: string; end_date: string; days_until_start: number; recommended_action: string; is_pricing_set: boolean; property_name: string }>()
  for (const o of rulesOutputs ?? []) {
    for (const w of o.special_windows) {
      if (w.days_until_start <= 180 && !windowMap.has(w.name)) {
        windowMap.set(w.name, { ...w, property_name: o.property_name })
      }
    }
  }
  const specialWindows = Array.from(windowMap.values()).sort(
    (a, b) => a.days_until_start - b.days_until_start
  )

  const visibleWeather = (weatherFlags ?? []).filter(
    (f) => !dismissedWeather.has(`${f.property_id}-${f.type}-${f.generated_at}`)
  )

  return (
    <div className="p-6 md:p-8 space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold text-white">Dashboard</h1>
        <p className="text-slate-400 mt-1">Overview of your STR properties</p>
      </div>

      {/* January Booking Surge Alert */}
      {isJanuary && !dismissedJanuary && (
        <div className="flex items-start gap-4 bg-blue-600/10 border border-blue-500/40 rounded-xl p-4">
          <span className="text-2xl shrink-0">📅</span>
          <div className="flex-1 min-w-0">
            <p className="text-white font-semibold">
              January Booking Surge Active
            </p>
            <p className="text-blue-300 text-sm mt-0.5">
              27% more summer bookings happen this month. Is your summer calendar priced?
            </p>
          </div>
          <div className="flex gap-2 shrink-0">
            <Link
              href="/settings"
              className="text-xs bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded-lg transition-colors"
            >
              Review Settings
            </Link>
            <button
              onClick={() => setDismissedJanuary(true)}
              className="text-xs text-slate-400 hover:text-white px-3 py-1.5 rounded-lg border border-slate-600 hover:border-slate-500 transition-colors"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Property Summary Cards */}
      {rulesOutputs && rulesOutputs.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {rulesOutputs.map((o) => (
            <PropertyCard
              key={o.property_id}
              output={o}
              stats={bookingStats?.[o.property_id]}
            />
          ))}
        </div>
      ) : (
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-8 text-center">
          <p className="text-slate-400 text-sm">
            No property data found.{' '}
            <Link href="/settings" className="text-blue-400 hover:underline">
              Set up your properties
            </Link>{' '}
            and{' '}
            <Link href="/import" className="text-blue-400 hover:underline">
              import booking data
            </Link>{' '}
            to get started.
          </p>
        </div>
      )}

      {/* Weather Alerts */}
      {visibleWeather.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold text-white mb-3">🌤️ Weather Alerts</h2>
          <div className="space-y-2">
            {visibleWeather.map((flag) => {
              const key = `${flag.property_id}-${flag.type}-${flag.generated_at}`
              return (
                <div
                  key={key}
                  className={`flex items-start gap-3 border rounded-xl p-4 ${WEATHER_COLORS[flag.type]}`}
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm">{flag.property_name}</p>
                    <p className="text-sm mt-0.5 opacity-90">{flag.message}</p>
                    {flag.affected_dates && flag.affected_dates.length > 0 && (
                      <p className="text-xs mt-1 opacity-70">
                        {flag.affected_dates.map(fmtDate).join(', ')}
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() => dismissWeather(key)}
                    className="text-xs opacity-60 hover:opacity-100 shrink-0"
                    aria-label="Dismiss"
                  >
                    ✕
                  </button>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* Action Required */}
      <section>
        <h2 className="text-lg font-semibold text-white mb-3">🚨 Action Required</h2>
        {topActions.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {topActions.map((alert) => (
              <ActionCard
                key={`${alert.property_id}-${alert.date}`}
                alert={alert}
                propertyName={alert.property_name}
                propertyId={alert.property_id}
                onDismiss={dismissAlert}
              />
            ))}
          </div>
        ) : (
          <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 text-center">
            <p className="text-emerald-400 font-medium">No urgent pricing actions right now.</p>
            <p className="text-slate-400 text-sm mt-1">
              You&apos;re on top of your pricing — check back tomorrow.
            </p>
          </div>
        )}
      </section>

      {/* Special Windows */}
      {specialWindows.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold text-white mb-3">⚡ Special Windows</h2>
          <div className="space-y-2">
            {specialWindows.map((w) => {
              const isMoab = w.property_name.toLowerCase().includes('moab')
              const calHref = isMoab ? '/calendar/moab' : '/calendar/bear-lake'
              return (
                <Link key={w.name} href={calHref}>
                  <div
                    className={`flex items-start gap-3 border rounded-xl p-4 hover:border-amber-400/60 transition-colors ${
                      w.is_pricing_set
                        ? 'border-slate-600 bg-slate-800'
                        : 'border-amber-500/40 bg-amber-500/5'
                    }`}
                  >
                    <span className="text-lg shrink-0">🔥</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-white font-semibold text-sm">{w.name}</span>
                        <span className="text-slate-400 text-xs">— {w.days_until_start} days away</span>
                        {w.is_pricing_set && (
                          <span className="text-xs bg-emerald-500/15 text-emerald-400 px-2 py-0.5 rounded-full">
                            Priced ✓
                          </span>
                        )}
                      </div>
                      <p className="text-slate-300 text-xs mt-1">
                        {fmtDate(w.start_date)}–{fmtDate(w.end_date)} · {w.recommended_action}
                      </p>
                    </div>
                    <span className="text-slate-500 text-xs shrink-0">→</span>
                  </div>
                </Link>
              )
            })}
          </div>
        </section>
      )}

      {/* Upcoming Demand Signals */}
      {upcomingEvents.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold text-white mb-3">📅 Upcoming Demand Signals</h2>
          <div className="bg-slate-800 border border-slate-700 rounded-xl divide-y divide-slate-700">
            {Array.from(eventsByWeek.entries()).map(([weekKey, events]) => {
              const weekStart = new Date(weekKey + 'T00:00:00')
              const weekLabel = weekStart.toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
              })
              return (
                <div key={weekKey} className="p-4">
                  <p className="text-slate-500 text-xs font-medium mb-2">
                    Week of {weekLabel}
                  </p>
                  <div className="space-y-2">
                    {events.map((e) => {
                      const impact =
                        e.multiplier >= 1.4
                          ? { label: 'High', cls: 'bg-red-500/15 text-red-400' }
                          : e.multiplier >= 1.2
                          ? { label: 'Medium', cls: 'bg-yellow-500/15 text-yellow-400' }
                          : { label: 'Low', cls: 'bg-slate-600/50 text-slate-400' }
                      return (
                        <div key={e.id} className="flex items-center gap-3">
                          <div className="flex-1 min-w-0">
                            <span className="text-white text-sm font-medium">{e.name}</span>
                            <span className="text-slate-400 text-xs ml-2">
                              {fmtDate(e.event_date)}
                              {e.end_date && e.end_date !== e.event_date
                                ? `–${fmtDate(e.end_date)}`
                                : ''}
                            </span>
                          </div>
                          <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${impact.cls}`}>
                            {impact.label}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* Booking Pace */}
      {rulesOutputs && rulesOutputs.length > 0 && bookingStats && (
        <BookingPaceChart outputs={rulesOutputs} stats={bookingStats} />
      )}
    </div>
  )
}
