'use client'

import { useEffect, useState, useCallback } from 'react'
import type { RulesEngineOutput, CompetitorPricingData } from '@/lib/types'
import type { SelectedDate } from './calendar-view'

interface DateSlideOverProps {
  selected: SelectedDate | null
  rulesOutput: RulesEngineOutput | null
  propertyId: string | null
  slug: 'moab' | 'bear-lake' | null
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

export function DateSlideOver({ selected, rulesOutput, propertyId, slug, onClose }: DateSlideOverProps) {
  const [competitorData, setCompetitorData] = useState<CompetitorPricingData | null>(null)
  const [competitorLoading, setCompetitorLoading] = useState(false)
  const [competitorError, setCompetitorError] = useState<string | null>(null)

  const fetchCompetitors = useCallback(async (forceRefresh = false) => {
    if (!propertyId || !slug) return
    setCompetitorLoading(true)
    setCompetitorError(null)
    try {
      const url = `/api/competitor-pricing?property_id=${propertyId}&slug=${slug}${forceRefresh ? '&refresh=true' : ''}`
      const res = await fetch(url)
      if (!res.ok) {
        const err = await res.json() as { error?: string }
        throw new Error(err.error ?? 'Failed to load competitor data')
      }
      const data = await res.json() as CompetitorPricingData
      setCompetitorData(data)
    } catch (err) {
      setCompetitorError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setCompetitorLoading(false)
    }
  }, [propertyId, slug])

  // Load competitor data when panel opens
  useEffect(() => {
    if (selected) {
      fetchCompetitors(false)
    } else {
      setCompetitorData(null)
      setCompetitorError(null)
    }
  }, [selected, fetchCompetitors])

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

          {/* Competitor Pricing */}
          {!isBooked && !isDead && (
            <section>
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-slate-400 text-xs font-medium uppercase tracking-wide">
                  Competitor Pricing
                </h4>
                {/* Cache-only read — live refresh is in Settings to avoid timeouts */}
              </div>

              {competitorLoading && !competitorData && (
                <div className="bg-slate-800 border border-slate-700 rounded-lg p-4 space-y-2 animate-pulse">
                  <div className="h-3 bg-slate-700 rounded w-3/4" />
                  <div className="h-3 bg-slate-700 rounded w-1/2" />
                  <div className="h-3 bg-slate-700 rounded w-2/3" />
                </div>
              )}

              {(competitorError || (!competitorLoading && !competitorData)) && (
                <div className="bg-slate-800/60 border border-slate-700 rounded-lg p-3">
                  <p className="text-slate-400 text-xs font-medium">No market data cached yet</p>
                  <p className="text-slate-500 text-xs mt-1">
                    Go to <span className="text-blue-400">Settings → Refresh Market Data</span> to fetch live competitor prices. Data auto-refreshes every 4 days.
                  </p>
                </div>
              )}

              {competitorData && (() => {
                const { market, competitors } = competitorData
                const yourMidPrice = priceLow && priceHigh ? Math.round((priceLow + priceHigh) / 2) : null
                const pctVsMarket = yourMidPrice && market.avg_price > 0
                  ? Math.round(((yourMidPrice - market.avg_price) / market.avg_price) * 100)
                  : null

                // Price rank: how many competitors are cheaper than you
                const rank = yourMidPrice
                  ? competitors.filter(c => c.price_per_night < yourMidPrice).length + 1
                  : null

                // Top 3 cheapest competitors
                const cheapest = [...competitors]
                  .sort((a, b) => a.price_per_night - b.price_per_night)
                  .slice(0, 3)

                const cacheAge = market.cached_at
                  ? Math.round((Date.now() - new Date(market.cached_at).getTime()) / (1000 * 60 * 60))
                  : null

                return (
                  <div className="space-y-3">
                    {/* Market stats */}
                    <div className="bg-slate-800 border border-slate-600 rounded-lg p-3 space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="text-slate-400 text-sm">Market avg</span>
                        <span className="text-white font-semibold">{fmt(market.avg_price)}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-slate-400 text-sm">Market range</span>
                        <span className="text-slate-300 text-sm">
                          {fmt(market.percentile_25)} – {fmt(market.percentile_75)}
                        </span>
                      </div>
                      {yourMidPrice && (
                        <div className="flex justify-between items-center">
                          <span className="text-slate-400 text-sm">Your price vs. market</span>
                          <span className={`text-sm font-medium ${
                            pctVsMarket === null ? 'text-slate-400'
                            : pctVsMarket > 15 ? 'text-red-400'
                            : pctVsMarket < -10 ? 'text-emerald-400'
                            : 'text-slate-300'
                          }`}>
                            {pctVsMarket === null ? '—'
                              : pctVsMarket > 0 ? `+${pctVsMarket}% above`
                              : pctVsMarket < 0 ? `${pctVsMarket}% below`
                              : 'At market'}
                          </span>
                        </div>
                      )}
                      {rank !== null && (
                        <div className="flex justify-between items-center">
                          <span className="text-slate-400 text-sm">Price rank</span>
                          <span className="text-slate-300 text-sm">
                            #{rank} of {competitors.length} comparable listings
                          </span>
                        </div>
                      )}
                      {market.market_occupancy_rate !== null && (
                        <div className="flex justify-between items-center">
                          <span className="text-slate-400 text-sm">Market occupancy</span>
                          <span className="text-slate-300 text-sm">
                            {Math.round(market.market_occupancy_rate * 100)}%
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Visual price bar */}
                    {yourMidPrice && market.percentile_25 > 0 && (
                      <div className="bg-slate-800 border border-slate-600 rounded-lg p-3">
                        <p className="text-slate-400 text-xs mb-2">Price position vs. market</p>
                        <div className="relative h-2 bg-slate-700 rounded-full overflow-hidden">
                          {/* Market range bar */}
                          <div
                            className="absolute top-0 h-full bg-blue-900/60 rounded-full"
                            style={{
                              left: `${Math.max(0, Math.min(90, ((market.percentile_25 / (market.percentile_75 * 1.3)) * 100)))}%`,
                              width: `${Math.min(60, ((market.percentile_75 - market.percentile_25) / (market.percentile_75 * 1.3)) * 100)}%`,
                            }}
                          />
                          {/* Your price indicator */}
                          <div
                            className="absolute top-0 w-1 h-full bg-white rounded-full"
                            style={{
                              left: `${Math.max(2, Math.min(96, (yourMidPrice / (market.percentile_75 * 1.3)) * 100))}%`,
                            }}
                          />
                        </div>
                        <div className="flex justify-between mt-1">
                          <span className="text-slate-600 text-xs">Low</span>
                          <span className="text-slate-400 text-xs">You: {fmt(yourMidPrice)}</span>
                          <span className="text-slate-600 text-xs">High</span>
                        </div>
                      </div>
                    )}

                    {/* Top 3 cheapest competitors */}
                    {cheapest.length > 0 && (
                      <div>
                        <p className="text-slate-500 text-xs mb-1.5">Lowest-priced competitors</p>
                        <div className="space-y-1.5">
                          {cheapest.map((c) => (
                            <div key={c.listing_id} className="flex items-center justify-between bg-slate-800/50 rounded-lg px-3 py-2">
                              <div className="flex-1 min-w-0">
                                <p className="text-slate-300 text-xs truncate">{c.name || 'Airbnb listing'}</p>
                                {c.rating !== null && (
                                  <p className="text-slate-500 text-xs">★ {c.rating.toFixed(1)}</p>
                                )}
                              </div>
                              <span className="text-white text-sm font-medium ml-3 shrink-0">
                                {fmt(c.price_per_night)}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Cache age + source */}
                    <p className="text-slate-600 text-xs">
                      {market.sample_size} listings · updated {cacheAge !== null ? `${cacheAge}h ago` : 'just now'} · Airbnb via Apify
                      {market.airroi_cached ? ' + AirROI' : ''}
                    </p>
                  </div>
                )
              })()}
            </section>
          )}
        </div>
      </div>
    </>
  )
}
