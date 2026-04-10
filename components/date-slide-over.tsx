'use client'

import { useEffect } from 'react'
import type { RulesEngineOutput } from '@/lib/types'
import type { SelectedDate } from './calendar-view'

interface DateSlideOverProps {
  selected: SelectedDate | null
  rulesOutput: RulesEngineOutput | null
  onClose: () => void
}

function fmt(n: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(n)
}

function fmtFull(dateStr: string) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

export function DateSlideOver({ selected, rulesOutput, onClose }: DateSlideOverProps) {
  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  if (!selected) return null

  const { dateStr, isBooked, booking, openDate, entry, orphanGap, events, isDead } = selected

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const targetDate = new Date(dateStr + 'T00:00:00')
  const daysUntil = Math.round((targetDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))

  // Determine alert level
  const alertLevel = openDate?.alert_level ?? entry?.alert_level ?? null

  // Get weather flags for this date (within 14 days)
  const weatherFlags =
    daysUntil <= 14
      ? (rulesOutput?.weather_flags ?? []).filter((f) =>
          f.affected_dates?.includes(dateStr)
        )
      : []

  // Price info
  const priceLow = openDate?.recommended_price_low ?? entry?.recommended_price_low
  const priceHigh = openDate?.recommended_price_high ?? entry?.recommended_price_high
  const discount = openDate?.suggested_discount ?? entry?.suggested_discount ?? 0

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div className="fixed inset-y-0 right-0 z-50 w-full max-w-md bg-[#1e293b] border-l border-slate-700 shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between p-5 border-b border-slate-700 shrink-0">
          <div>
            <p className="text-white font-semibold text-base">{fmtFull(dateStr)}</p>
            <p className="text-slate-400 text-sm mt-0.5">
              {daysUntil === 0
                ? 'Today'
                : daysUntil === 1
                ? 'Tomorrow'
                : `${daysUntil} days away`}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white transition-colors p-1 rounded-lg hover:bg-slate-700"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Booking Status */}
          <section>
            <h4 className="text-slate-400 text-xs font-medium uppercase tracking-wide mb-2">
              Booking Status
            </h4>
            {isBooked ? (
              <div className="bg-emerald-900/30 border border-emerald-600/40 rounded-lg p-3">
                <p className="text-emerald-300 font-semibold">Booked</p>
                {booking && (
                  <div className="mt-1 space-y-0.5">
                    <p className="text-slate-300 text-sm">
                      Check-in: {new Date(booking.check_in + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      {' → '}
                      Check-out: {new Date(booking.check_out + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </p>
                    <p className="text-slate-300 text-sm">{booking.nights} nights</p>
                    {booking.nightly_rate && (
                      <p className="text-slate-300 text-sm">
                        Booked at {fmt(booking.nightly_rate)}/night ·{' '}
                        {fmt(booking.total_revenue)} total
                      </p>
                    )}
                  </div>
                )}
              </div>
            ) : isDead ? (
              <div className="bg-slate-800 border border-slate-600 rounded-lg p-3">
                <p className="text-slate-400 font-medium">Low Season</p>
                <p className="text-slate-500 text-sm mt-0.5">
                  This date falls within a typical low-demand period.
                </p>
              </div>
            ) : (
              <div className="bg-slate-800 border border-slate-600 rounded-lg p-3">
                <p className="text-white font-medium">Open</p>
                {openDate?.is_weekend && (
                  <p className="text-blue-400 text-sm mt-0.5">Weekend (higher demand night)</p>
                )}
              </div>
            )}
          </section>

          {/* Alert */}
          {alertLevel && !isBooked && (
            <section>
              <h4 className="text-slate-400 text-xs font-medium uppercase tracking-wide mb-2">
                Alert
              </h4>
              <div
                className={`rounded-lg p-3 border ${
                  alertLevel === 'action'
                    ? 'bg-red-900/30 border-red-500/40'
                    : 'bg-yellow-900/30 border-yellow-500/40'
                }`}
              >
                <p
                  className={`font-semibold text-sm ${
                    alertLevel === 'action' ? 'text-red-300' : 'text-yellow-300'
                  }`}
                >
                  {alertLevel === 'action' ? '🚨 Action Required' : '👁 Watch'}
                </p>
                {openDate?.is_behind_pace && (
                  <p className="text-slate-300 text-sm mt-1">
                    Behind booking pace for this date. Consider{' '}
                    {discount > 0 ? `a ${discount}% discount` : 'a price adjustment'} to
                    stimulate demand.
                  </p>
                )}
              </div>
            </section>
          )}

          {/* Pricing */}
          {!isBooked && !isDead && (priceLow || priceHigh) && (
            <section>
              <h4 className="text-slate-400 text-xs font-medium uppercase tracking-wide mb-2">
                Recommended Pricing
              </h4>
              <div className="bg-slate-800 border border-slate-600 rounded-lg p-3 space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-slate-400 text-sm">Recommended range</span>
                  <span className="text-white font-semibold">
                    {priceLow ? fmt(priceLow) : '—'} – {priceHigh ? fmt(priceHigh) : '—'}
                  </span>
                </div>
                {openDate?.seasonal_multiplier && (
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400 text-sm">Seasonal multiplier</span>
                    <span className="text-slate-300 text-sm">
                      {openDate.seasonal_multiplier.toFixed(2)}×
                    </span>
                  </div>
                )}
                {discount > 0 && (
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400 text-sm">Suggested discount</span>
                    <span className="text-amber-400 text-sm font-medium">{discount}% off base</span>
                  </div>
                )}
                {openDate?.event_name && (
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400 text-sm">Event boost</span>
                    <span className="text-emerald-400 text-sm">{openDate.event_name}</span>
                  </div>
                )}
              </div>
              <p className="text-slate-500 text-xs mt-1.5">
                Apply changes manually in your Airbnb/Vrbo hosting dashboard.
              </p>
            </section>
          )}

          {/* Orphan Gap */}
          {orphanGap && (
            <section>
              <h4 className="text-slate-400 text-xs font-medium uppercase tracking-wide mb-2">
                Orphan Gap
              </h4>
              <div className="bg-purple-900/20 border border-purple-500/40 rounded-lg p-3">
                <p className="text-purple-300 font-medium text-sm">
                  {orphanGap.nights}-night gap between bookings
                </p>
                <p className="text-slate-300 text-sm mt-1">
                  Suggested minimum stay: {orphanGap.suggested_min_stay} nights
                  {orphanGap.suggested_discount > 0
                    ? ` · ${orphanGap.suggested_discount}% discount`
                    : ''}
                </p>
                {orphanGap.adjacent_to_event && (
                  <p className="text-purple-400 text-xs mt-1">Adjacent to an event — hold rate</p>
                )}
              </div>
            </section>
          )}

          {/* Events */}
          {events.length > 0 && (
            <section>
              <h4 className="text-slate-400 text-xs font-medium uppercase tracking-wide mb-2">
                Events on This Date
              </h4>
              <div className="space-y-2">
                {events.map((e) => (
                  <div
                    key={e.id}
                    className="bg-slate-800 border border-slate-600 rounded-lg p-3"
                  >
                    <p className="text-white text-sm font-medium">{e.name}</p>
                    <p className="text-slate-400 text-xs mt-0.5 capitalize">{e.event_type}</p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Weather */}
          {weatherFlags.length > 0 && (
            <section>
              <h4 className="text-slate-400 text-xs font-medium uppercase tracking-wide mb-2">
                Weather (14-day forecast)
              </h4>
              <div className="space-y-2">
                {weatherFlags.map((f, i) => (
                  <div
                    key={i}
                    className="bg-slate-800 border border-slate-600 rounded-lg p-3"
                  >
                    <p className="text-white text-sm">{f.message}</p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Competitor Pricing — Placeholder */}
          <section>
            <h4 className="text-slate-400 text-xs font-medium uppercase tracking-wide mb-2">
              Competitor Pricing
            </h4>
            <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-4 opacity-60">
              <div className="flex items-center justify-between mb-3">
                <span className="text-slate-400 text-sm">Coming Soon</span>
                <span className="text-xs bg-slate-700 text-slate-400 px-2 py-0.5 rounded-full">
                  Planned
                </span>
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-500">Market Average</span>
                  <span className="text-slate-600">—</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Your Price Rank</span>
                  <span className="text-slate-600">—</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Price Gap</span>
                  <span className="text-slate-600">—</span>
                </div>
              </div>
              <p className="text-slate-600 text-xs mt-3">
                {/* TODO: Connect PriceLabs Market Dashboard or AirDNA API. Start with AirROI (airroi.com — free, no account required). */}
                Planned sources: AirROI (free), PriceLabs Market Dashboard ($9.99/mo), AirDNA
              </p>
            </div>
          </section>
        </div>
      </div>
    </>
  )
}
