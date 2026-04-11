'use client'

import { useState, useEffect, useCallback } from 'react'
import { format, formatDistanceToNow } from 'date-fns'
import type { CompetitorListing, MarketSnapshot } from '@/lib/competitor-pricing'

interface PropertyCompetitorData {
  property_id: string
  property_name: string
  slug: string
  competitors: CompetitorListing[]
  market: MarketSnapshot | null
  fetched_at: string | null
}

type SortKey = 'price_per_night' | 'rating' | 'bedrooms' | 'distance_miles' | 'ttm_revenue' | 'ttm_occupancy'

function fmt(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)
}
function fmtD(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n)
}

function SourceBadge({ platform }: { platform: 'airbnb' | 'airroi' }) {
  return platform === 'airroi'
    ? <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-violet-500/10 text-violet-400">AirROI</span>
    : <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-rose-500/10 text-rose-400">Airbnb</span>
}

function TypeBadge({ type }: { type: string | null }) {
  if (!type) return null
  const label = type.replace(/^Entire\s+/i, '')
  const colors: Record<string, string> = {
    home: 'bg-blue-500/10 text-blue-400',
    cabin: 'bg-amber-500/10 text-amber-400',
    condo: 'bg-purple-500/10 text-purple-400',
    townhouse: 'bg-emerald-500/10 text-emerald-400',
    'rental unit': 'bg-slate-500/15 text-slate-400',
    'vacation home': 'bg-blue-500/10 text-blue-400',
    cottage: 'bg-amber-500/10 text-amber-400',
    villa: 'bg-rose-500/10 text-rose-400',
    guesthouse: 'bg-slate-500/15 text-slate-400',
    entire_home: 'bg-slate-500/15 text-slate-400',
  }
  const cls = colors[label.toLowerCase()] ?? 'bg-slate-500/15 text-slate-400'
  return <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${cls}`}>{label || type}</span>
}

function StatCell({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-slate-500 mb-0.5">{label}</p>
      <p className="text-sm font-semibold text-white truncate">{value}</p>
      {sub && <p className="text-xs text-slate-600 mt-0.5">{sub}</p>}
    </div>
  )
}

function ListingCard({ c, index }: { c: CompetitorListing; index: number }) {
  const [open, setOpen] = useState(false)

  const hasAirROIData = c.platform === 'airroi'
  const hasAnyFees = c.cleaning_fee != null || c.extra_guest_fee != null
  const hasPerf = c.ttm_revenue != null || c.ttm_occupancy != null

  return (
    <div className="border border-slate-700/40 rounded-xl overflow-hidden bg-slate-800/30">
      {/* ── Main row ── */}
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-slate-700/20 transition-colors"
      >
        {/* Index */}
        <span className="text-slate-600 text-xs w-5 shrink-0">{index + 1}</span>

        {/* Name */}
        <div className="flex-1 min-w-0">
          <p className="text-slate-200 text-sm font-medium leading-snug truncate" title={c.name}>
            {c.name || 'Listing'}
          </p>
          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
            <SourceBadge platform={c.platform} />
            <TypeBadge type={c.property_type} />
            {c.superhost && (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-yellow-500/10 text-yellow-400">Superhost</span>
            )}
            {c.instant_book && (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-green-500/10 text-green-400">Instant Book</span>
            )}
          </div>
        </div>

        {/* Key stats */}
        <div className="hidden sm:flex items-center gap-6 shrink-0">
          {c.bedrooms != null && (
            <div className="text-center">
              <p className="text-xs text-slate-500">Beds</p>
              <p className="text-sm font-semibold text-slate-200">{c.bedrooms}br</p>
            </div>
          )}
          {c.rating != null && (
            <div className="text-center">
              <p className="text-xs text-slate-500">Rating</p>
              <p className="text-sm font-semibold text-amber-400">★ {c.rating.toFixed(2)}</p>
            </div>
          )}
          {c.distance_miles != null && (
            <div className="text-center">
              <p className="text-xs text-slate-500">Distance</p>
              <p className="text-sm font-semibold text-slate-200">{c.distance_miles} mi</p>
            </div>
          )}
          <div className="text-center">
            <p className="text-xs text-slate-500">Avg/night</p>
            <p className="text-sm font-bold text-white">{fmtD(c.price_per_night)}</p>
          </div>
        </div>

        {/* Mobile price */}
        <div className="sm:hidden shrink-0 text-right">
          <p className="text-sm font-bold text-white">{fmtD(c.price_per_night)}</p>
          {c.rating != null && <p className="text-xs text-amber-400">★ {c.rating.toFixed(1)}</p>}
        </div>

        {/* Expand arrow */}
        {hasAirROIData && (
          <svg className={`w-4 h-4 text-slate-500 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        )}
        {c.url && !hasAirROIData && (
          <a href={c.url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
            className="text-blue-400 hover:text-blue-300 shrink-0" title="View on Airbnb">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </a>
        )}
      </button>

      {/* ── Expanded detail panel ── */}
      {open && hasAirROIData && (
        <div className="border-t border-slate-700/40 px-4 py-4 bg-slate-800/50 space-y-4">

          {/* Fees */}
          {hasAnyFees && (
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Fees</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <StatCell label="Cleaning fee" value={c.cleaning_fee != null ? fmtD(c.cleaning_fee) : '—'} />
                <StatCell label="Extra guest fee" value={c.extra_guest_fee != null && c.extra_guest_fee > 0 ? fmtD(c.extra_guest_fee) : 'None'} />
              </div>
            </div>
          )}

          {/* Booking settings */}
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Booking Rules</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <StatCell label="Min nights" value={c.min_nights != null ? `${c.min_nights} nights` : '—'} />
              <StatCell label="Instant book" value={c.instant_book == null ? '—' : c.instant_book ? 'Yes' : 'No'} />
              <StatCell label="Cancellation" value={c.cancellation_policy ?? '—'} />
              {c.num_reviews != null && (
                <StatCell label="Reviews" value={c.num_reviews.toLocaleString()} />
              )}
            </div>
          </div>

          {/* Performance metrics */}
          {hasPerf && (
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Performance (AirROI Data)</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {c.ttm_revenue != null && (
                  <StatCell label="Annual revenue" value={fmt(c.ttm_revenue)} sub="trailing 12 months" />
                )}
                {c.ttm_occupancy != null && (
                  <StatCell label="Annual occupancy" value={`${Math.round(c.ttm_occupancy * 100)}%`} sub="trailing 12 months" />
                )}
                {c.l90d_avg_rate != null && (
                  <StatCell label="Recent avg rate" value={fmtD(c.l90d_avg_rate)} sub="last 90 days" />
                )}
                {c.l90d_occupancy != null && (
                  <StatCell label="Recent occupancy" value={`${Math.round(c.l90d_occupancy * 100)}%`} sub="last 90 days" />
                )}
              </div>
            </div>
          )}

          {/* View on Airbnb link */}
          {c.url && (
            <a href={c.url} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 transition-colors">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
              View on Airbnb
            </a>
          )}
        </div>
      )}
    </div>
  )
}

export default function CompetitorsPage() {
  const [data, setData] = useState<PropertyCompetitorData[]>([])
  const [loading, setLoading] = useState(true)
  const [activeSlug, setActiveSlug] = useState<string | null>(null)
  const [sortKey, setSortKey] = useState<SortKey>('price_per_night')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

  const load = useCallback(() => {
    setLoading(true)
    fetch('/api/competitors')
      .then(r => r.json())
      .then((d: PropertyCompetitorData[]) => {
        setData(d)
        if (d.length > 0 && !activeSlug) setActiveSlug(d[0].slug)
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [activeSlug])

  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const activeData = data.find(d => d.slug === activeSlug)
  const market = activeData?.market ?? null

  const sorted = [...(activeData?.competitors ?? [])].sort((a, b) => {
    const nullLast = sortDir === 'asc' ? Infinity : -Infinity
    const aVal = (a[sortKey] as number | null) ?? nullLast
    const bVal = (b[sortKey] as number | null) ?? nullLast
    return sortDir === 'asc' ? aVal - bVal : bVal - aVal
  })

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir(key === 'rating' ? 'desc' : 'asc') }
  }

  if (loading) {
    return (
      <div className="p-6 md:p-8 space-y-6">
        <div className="h-7 w-64 bg-slate-700/50 rounded animate-pulse" />
        <div className="h-32 bg-slate-700/50 rounded-xl animate-pulse" />
        <div className="h-96 bg-slate-700/50 rounded-xl animate-pulse" />
      </div>
    )
  }

  if (!data.length) {
    return (
      <div className="p-6 md:p-8">
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-8 text-center">
          <p className="text-slate-400">No competitor data yet.</p>
          <p className="text-slate-500 text-sm mt-1">Go to Settings → Competitor Market Data → Sync Now</p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 md:p-8 max-w-5xl">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-white">Competitor Listings</h1>
        <p className="text-slate-400 mt-1">Comparable properties near each of your rentals · click any listing to expand</p>
      </div>

      {/* Property tabs */}
      <div className="flex gap-2 mb-6">
        {data.map(d => (
          <button key={d.slug} onClick={() => setActiveSlug(d.slug)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeSlug === d.slug ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white border border-slate-700'
            }`}
          >
            {d.property_name}
            {d.competitors.length > 0 && (
              <span className={`ml-2 text-xs px-1.5 py-0.5 rounded-full ${activeSlug === d.slug ? 'bg-blue-500' : 'bg-slate-700 text-slate-500'}`}>
                {d.competitors.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Market summary ── */}
      {market && (
        <div className="bg-[#1e293b] border border-slate-700/50 rounded-xl p-5 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-white uppercase tracking-wide">Market Summary</h2>
            {activeData?.fetched_at && (
              <span className="text-xs text-slate-500">
                Updated {formatDistanceToNow(new Date(activeData.fetched_at), { addSuffix: true })}
              </span>
            )}
          </div>

          {/* Pricing stats */}
          {market.sample_size > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
              <div>
                <p className="text-xs text-slate-400 mb-1">Market avg</p>
                <p className="text-xl font-bold text-white">{fmt(market.avg_price)}</p>
                <p className="text-xs text-slate-500">per night · {market.sample_size} listings</p>
              </div>
              <div>
                <p className="text-xs text-slate-400 mb-1">Range (25–75%)</p>
                <p className="text-lg font-semibold text-white">{fmt(market.percentile_25)} – {fmt(market.percentile_75)}</p>
                <p className="text-xs text-slate-500">middle 50% of comps</p>
              </div>
              <div>
                <p className="text-xs text-slate-400 mb-1">Median price</p>
                <p className="text-lg font-semibold text-white">{fmt(market.median_price)}</p>
                <p className="text-xs text-slate-500">per night</p>
              </div>
              {market.market_occupancy_rate != null ? (
                <div>
                  <p className="text-xs text-slate-400 mb-1">Market occupancy</p>
                  <p className="text-xl font-bold text-white">{Math.round(market.market_occupancy_rate * 100)}%</p>
                  <p className="text-xs text-slate-500">ADR {market.market_adr != null ? fmt(market.market_adr) : '—'}</p>
                </div>
              ) : (
                <div>
                  <p className="text-xs text-slate-400 mb-1">Occupancy</p>
                  <p className="text-lg font-medium text-slate-500">—</p>
                </div>
              )}
            </div>
          )}

          {/* AirROI market intelligence row */}
          {(market.booking_lead_time != null || market.avg_length_of_stay != null || market.active_listings_count != null || market.rev_par != null) && (
            <>
              <div className="border-t border-slate-700/40 pt-4">
                <p className="text-xs font-semibold text-violet-400 uppercase tracking-wider mb-3">AirROI Market Intelligence</p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {market.booking_lead_time != null && (
                    <div>
                      <p className="text-xs text-slate-400 mb-1">Booking lead time</p>
                      <p className="text-lg font-semibold text-white">{Math.round(market.booking_lead_time)} days</p>
                      <p className="text-xs text-slate-500">avg days booked in advance</p>
                    </div>
                  )}
                  {market.avg_length_of_stay != null && (
                    <div>
                      <p className="text-xs text-slate-400 mb-1">Avg stay</p>
                      <p className="text-lg font-semibold text-white">{market.avg_length_of_stay.toFixed(1)} nights</p>
                      <p className="text-xs text-slate-500">average length of stay</p>
                    </div>
                  )}
                  {market.market_min_nights != null && (
                    <div>
                      <p className="text-xs text-slate-400 mb-1">Market min nights</p>
                      <p className="text-lg font-semibold text-white">{market.market_min_nights} nights</p>
                      <p className="text-xs text-slate-500">typical minimum requirement</p>
                    </div>
                  )}
                  {market.active_listings_count != null && (
                    <div>
                      <p className="text-xs text-slate-400 mb-1">Active listings</p>
                      <p className="text-lg font-semibold text-white">{market.active_listings_count.toLocaleString()}</p>
                      <p className="text-xs text-slate-500">in your market</p>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* No data state */}
      {!market || market.sample_size === 0 ? (
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-8 text-center">
          <p className="text-slate-400">No listings cached for this property yet.</p>
          <p className="text-slate-500 text-sm mt-1">Go to Settings → Competitor Market Data → Sync Now</p>
        </div>
      ) : (
        <>
          {/* Sort bar */}
          <div className="flex items-center gap-1 mb-3 flex-wrap">
            <span className="text-xs text-slate-500 mr-1">Sort:</span>
            {([
              { key: 'price_per_night',  label: 'Price' },
              { key: 'distance_miles',   label: 'Distance' },
              { key: 'rating',           label: 'Rating' },
              { key: 'bedrooms',         label: 'Beds' },
              { key: 'ttm_revenue',      label: 'Revenue' },
              { key: 'ttm_occupancy',    label: 'Occupancy' },
            ] as { key: SortKey; label: string }[]).map(({ key, label }) => (
              <button key={key} type="button" onClick={() => toggleSort(key)}
                className={`px-2.5 py-1 rounded-md text-xs transition-colors ${
                  sortKey === key
                    ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30'
                    : 'bg-slate-800 text-slate-400 hover:text-white border border-slate-700'
                }`}
              >
                {label}
                {sortKey === key && <span className="ml-1">{sortDir === 'asc' ? '↑' : '↓'}</span>}
              </button>
            ))}
          </div>

          {/* Listings */}
          <div className="space-y-2">
            {sorted.map((c, i) => <ListingCard key={c.listing_id || i} c={c} index={i} />)}
          </div>

          <div className="mt-4 flex items-center justify-between text-xs text-slate-600">
            <p>{sorted.length} comparable listings · click to expand details</p>
            {activeData?.fetched_at && (
              <p>{format(new Date(activeData.fetched_at), 'MMM d, yyyy h:mm a')}</p>
            )}
          </div>
        </>
      )}
    </div>
  )
}
