'use client'

import type {
  RulesEngineOutput,
  OpenDateAnalysis,
  OrphanGap,
  CalendarBooking,
  CalendarEntry,
  CalendarEvent,
} from '@/lib/types'

// ─── Types ────────────────────────────────────────────────────────────────────

export type PropertySlug = 'moab' | 'bear-lake'

export interface SelectedDate {
  dateStr: string
  isBooked: boolean
  booking: CalendarBooking | null
  openDate: OpenDateAnalysis | null
  entry: CalendarEntry | null
  orphanGap: OrphanGap | null
  events: CalendarEvent[]
  isDead: boolean
}

// ─── Dead zone helpers ────────────────────────────────────────────────────────

function isDeadZone(date: Date, slug: PropertySlug): boolean {
  const month = date.getMonth() + 1 // 1-indexed
  const day = date.getDate()

  if (slug === 'moab') {
    // Jun 15 – Aug 15 (summer dead zone)
    if (month === 6 && day >= 15) return true
    if (month === 7) return true
    if (month === 8 && day <= 15) return true
    // Dec 15 – Feb 1 (winter dead zone)
    if (month === 12 && day >= 15) return true
    if (month === 1) return true
    if (month === 2 && day <= 1) return true
    return false
  }

  // Bear Lake: Oct 24 – May 19 (off-season)
  if (month === 10 && day >= 24) return true
  if (month === 11 || month === 12) return true
  if (month >= 1 && month <= 4) return true
  if (month === 5 && day <= 19) return true
  return false
}

// ─── Date helpers ─────────────────────────────────────────────────────────────

function toDateStr(d: Date): string {
  return d.toISOString().split('T')[0]
}

function localDate(dateStr: string): Date {
  const [y, m, day] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, day)
}

function isBooked(dateStr: string, bookings: CalendarBooking[]): CalendarBooking | null {
  return (
    bookings.find((b) => b.check_in <= dateStr && dateStr < b.check_out) ?? null
  )
}

function getEventsForDate(dateStr: string, events: CalendarEvent[]): CalendarEvent[] {
  return events.filter((e) => {
    const end = e.end_date ?? e.event_date
    return e.event_date <= dateStr && dateStr <= end
  })
}

function fmt(n: number) {
  return '$' + Math.round(n).toLocaleString()
}

// ─── Cell color logic ─────────────────────────────────────────────────────────

function getCellStyle(sel: SelectedDate): {
  bg: string
  text: string
  border: string
} {
  // Booked takes priority over dead zone — a booking in low season should still show green
  if (sel.isBooked) {
    return { bg: 'bg-emerald-900/60', text: 'text-emerald-300', border: '' }
  }
  if (sel.isDead) {
    return { bg: 'bg-slate-900/80', text: 'text-slate-600', border: '' }
  }
  if (sel.openDate?.alert_level === 'action' || sel.entry?.alert_level === 'action') {
    return { bg: 'bg-red-900/50', text: 'text-red-300', border: 'border-red-500/50' }
  }
  if (sel.openDate?.alert_level === 'watch' || sel.entry?.alert_level === 'watch') {
    return { bg: 'bg-yellow-900/40', text: 'text-yellow-300', border: 'border-yellow-500/50' }
  }
  return { bg: 'bg-slate-800/60', text: 'text-slate-300', border: '' }
}

// ─── Calendar Grid ────────────────────────────────────────────────────────────

interface CalendarViewProps {
  rulesOutput: RulesEngineOutput | null
  bookings: CalendarBooking[]
  entries: CalendarEntry[]
  events: CalendarEvent[]
  slug: PropertySlug
  onSelectDate: (sel: SelectedDate) => void
  selectedDateStr: string | null
}

const DOW_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export function CalendarView({
  rulesOutput,
  bookings,
  entries,
  events,
  slug,
  onSelectDate,
  selectedDateStr,
}: CalendarViewProps) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const todayStr = toDateStr(today)

  // Build lookup maps for fast access
  const openDateMap = new Map<string, OpenDateAnalysis>()
  for (const d of rulesOutput?.open_dates ?? []) openDateMap.set(d.date, d)

  const entryMap = new Map<string, CalendarEntry>()
  for (const e of entries) entryMap.set(e.date, e)

  const orphanGaps = rulesOutput?.orphan_gaps ?? []

  function getOrphanGap(dateStr: string): OrphanGap | null {
    return orphanGaps.find((g) => g.start_date <= dateStr && dateStr <= g.end_date) ?? null
  }

  function buildSelectedDate(dateStr: string): SelectedDate {
    const date = localDate(dateStr)
    const booking = isBooked(dateStr, bookings)
    const openDate = openDateMap.get(dateStr) ?? null
    const entry = entryMap.get(dateStr) ?? null
    const orphanGap = getOrphanGap(dateStr)
    const dateEvents = getEventsForDate(dateStr, events)
    const dead = isDeadZone(date, slug)
    return {
      dateStr,
      isBooked: !!booking,
      booking,
      openDate,
      entry,
      orphanGap,
      events: dateEvents,
      isDead: dead,
    }
  }

  // Generate 6 months starting from current month
  const months: { year: number; month: number }[] = []
  for (let i = 0; i < 6; i++) {
    const d = new Date(today.getFullYear(), today.getMonth() + i, 1)
    months.push({ year: d.getFullYear(), month: d.getMonth() })
  }

  return (
    <div className="space-y-8">
      {months.map(({ year, month }) => {
        const firstDay = new Date(year, month, 1)
        const lastDay = new Date(year, month + 1, 0)
        const monthLabel = firstDay.toLocaleDateString('en-US', {
          month: 'long',
          year: 'numeric',
        })

        // Pad start with empty cells
        const startPad = firstDay.getDay() // 0=Sun
        const totalDays = lastDay.getDate()

        const cells: (string | null)[] = [
          ...Array(startPad).fill(null),
          ...Array.from({ length: totalDays }, (_, i) => {
            const d = new Date(year, month, i + 1)
            return toDateStr(d)
          }),
        ]

        // Pad end to complete final row
        while (cells.length % 7 !== 0) cells.push(null)

        return (
          <div key={`${year}-${month}`}>
            {/* Month header */}
            <h3 className="text-white font-semibold text-base mb-3">{monthLabel}</h3>

            {/* DOW headers */}
            <div className="grid grid-cols-7 mb-1">
              {DOW_LABELS.map((d) => (
                <div
                  key={d}
                  className="text-center text-xs font-medium text-slate-500 py-1"
                >
                  {d}
                </div>
              ))}
            </div>

            {/* Date grid */}
            <div className="grid grid-cols-7 gap-px bg-slate-700/30 rounded-lg overflow-hidden">
              {cells.map((dateStr, idx) => {
                if (!dateStr) {
                  return (
                    <div key={`empty-${idx}`} className="bg-slate-900/40 aspect-square min-h-[52px]" />
                  )
                }

                const sel = buildSelectedDate(dateStr)
                const style = getCellStyle(sel)
                const isPast = dateStr < todayStr
                const isSelected = dateStr === selectedDateStr
                const hasEvents = sel.events.length > 0

                // Price to display
                let priceLabel: string | null = null
                if (!sel.isBooked && !sel.isDead) {
                  const hi =
                    sel.openDate?.recommended_price_high ?? sel.entry?.recommended_price_high
                  if (hi) priceLabel = fmt(hi)
                }

                return (
                  <button
                    key={dateStr}
                    onClick={() => onSelectDate(sel)}
                    disabled={isPast}
                    className={`
                      relative flex flex-col items-center justify-start gap-0.5
                      aspect-square min-h-[52px] p-1 text-left
                      transition-all duration-100
                      ${style.bg}
                      ${isPast ? 'opacity-40 cursor-default' : 'cursor-pointer hover:brightness-125'}
                      ${isSelected ? 'ring-2 ring-blue-400 ring-inset z-10' : ''}
                      ${sel.orphanGap ? 'ring-1 ring-inset ring-purple-500' : ''}
                      ${style.border ? `border ${style.border}` : ''}
                    `}
                  >
                    {/* Day number */}
                    <span
                      className={`text-xs font-medium leading-none pt-0.5 ${
                        dateStr === todayStr
                          ? 'bg-blue-600 text-white rounded-full w-5 h-5 flex items-center justify-center text-[10px]'
                          : style.text
                      }`}
                    >
                      {new Date(dateStr + 'T00:00:00').getDate()}
                    </span>

                    {/* Price */}
                    {priceLabel && (
                      <span className={`text-[9px] leading-none font-medium ${style.text}`}>
                        {priceLabel}
                      </span>
                    )}

                    {/* Booked indicator */}
                    {sel.isBooked && (
                      <span className="text-[9px] text-emerald-400 leading-none">Booked</span>
                    )}

                    {/* Event dot(s) */}
                    {hasEvents && (
                      <div className="flex gap-0.5 mt-auto pb-0.5 flex-wrap justify-center">
                        {sel.events.slice(0, 2).map((e) => {
                          const dotColor =
                            e.event_type === 'festival' || e.event_type === 'major'
                              ? 'bg-red-400'
                              : e.event_type === 'holiday'
                              ? 'bg-yellow-400'
                              : 'bg-slate-400'
                          return (
                            <span
                              key={e.id}
                              className={`w-1 h-1 rounded-full shrink-0 ${dotColor}`}
                            />
                          )
                        })}
                      </div>
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        )
      })}

      {/* Legend */}
      <div className="flex flex-wrap gap-4 text-xs text-slate-400 pt-2 border-t border-slate-700">
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-emerald-900/60 border border-emerald-600/30" />
          Booked
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-red-900/50 border border-red-500/50" />
          Action needed
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-yellow-900/40 border border-yellow-500/50" />
          Watch
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-slate-800/60" />
          Open
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-slate-900/80" />
          Low season
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded border border-purple-500" />
          Orphan gap
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-red-400" />
          High-impact event
        </span>
      </div>
    </div>
  )
}
