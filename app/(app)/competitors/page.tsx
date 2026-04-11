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

type SortKey = 'price_per_night' | 'rating' | 'bedrooms'

function fmt(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)
}

function SortIcon({ active, dir }: { active: boolean; dir: 'asc' | 'desc' }) {
  return (
    <svg className={`w-3 h-3 inline ml-1 ${active ? 'text-blue-400' : 'text-slate-600'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      {dir === 'asc' || !active
        ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
        : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />}
    </svg>
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

  const sorted = [...(activeData?.competitors ?? [])].sort((a, b) => {
    const nullLast = sortDir === 'asc' ? Infinity : -Infinity
    const aVal = a[sortKey] ?? nullLast
    const bVal = b[sortKey] ?? nullLast
    return sortDir === 'asc'
      ? (aVal as number) - (bVal as number)
      : (bVal as number) - (aVal as number)
  })

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDir(key === 'rating' ? 'desc' : 'asc')
    }
  }

  function typeBadge(type: string | null) {
    if (!type) return null
    const label = type.replace('Entire ', '')
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
    }
    const cls = colors[label.toLowerCase()] ?? 'bg-slate-500/15 text-slate-400'
    return (
      <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${cls}`}>
        {label}
      </span>
    )
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
          <p className="text-slate-500 text-sm mt-1">Go to Settings → Competitor Market Data → Refresh Now</p>
        </div>
      </div>
    )
  }

  const market = activeData?.market ?? null

  return (
    <div className="p-6 md:p-8 max-w-5xl">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-white">Competitor Listings</h1>
        <p className="text-slate-400 mt-1">Live Airbnb comps near each property · entire homes only</p>
      </div>

      {/* Property tabs */}
      <div className="flex gap-2 mb-6">
        {data.map(d => (
          <button
            key={d.slug}
            onClick={() => setActiveSlug(d.slug)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeSlug === d.slug
                ? 'bg-blue-600 text-white'
                : 'bg-slate-800 text-slate-400 hover:text-white border border-slate-700'
            }`}
          >
            {d.property_name}
            {d.competitors.length > 0 && (
              <span className={`ml-2 text-xs px-1.5 py-0.5 rounded-full ${
                activeSlug === d.slug ? 'bg-blue-500' : 'bg-slate-700 text-slate-500'
              }`}>
                {d.competitors.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Market summary */}
      {market && market.sample_size > 0 && (
        <div className="bg-[#1e293b] border border-slate-700/50 rounded-xl p-5 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-white uppercase tracking-wide">Market Summary</h2>
            {activeData?.fetched_at && (
              <span className="text-xs text-slate-500">
                Updated {formatDistanceToNow(new Date(activeData.fetched_at), { addSuffix: true })}
              </span>
            )}
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-xs text-slate-400 mb-1">Market avg</p>
              <p className="text-xl font-bold text-white">{fmt(market.avg_price)}</p>
              <p className="text-xs text-slate-500">per night</p>
            </div>
            <div>
              <p className="text-xs text-slate-400 mb-1">Range (25–75%)</p>
              <p className="text-lg font-semibold text-white">{fmt(market.percentile_25)} – {fmt(market.percentile_75)}</p>
              <p className="text-xs text-slate-500">middle 50% of listings</p>
            </div>
            <div>
              <p className="text-xs text-slate-400 mb-1">Median price</p>
              <p className="text-lg font-semibold text-white">{fmt(market.median_price)}</p>
              <p className="text-xs text-slate-500">{market.sample_size} comparable listings</p>
            </div>
            {market.market_occupancy_rate != null ? (
              <div>
                <p className="text-xs text-slate-400 mb-1">Market occupancy</p>
                <p className="text-xl font-bold text-white">{Math.round(market.market_occupancy_rate * 100)}%</p>
                <p className="text-xs text-slate-500">
                  ADR {market.market_adr != null ? fmt(market.market_adr) : '—'} · AirROI
                </p>
              </div>
            ) : (
              <div>
                <p className="text-xs text-slate-400 mb-1">AirROI occupancy</p>
                <p className="text-lg font-medium text-slate-500">Not available</p>
                <p className="text-xs text-slate-600">API key set but no data returned yet</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* No data state */}
      {!market || market.sample_size === 0 ? (
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-8 text-center">
          <p className="text-slate-400">No listings cached for this property yet.</p>
          <p className="text-slate-500 text-sm mt-1">Go to Settings → Competitor Market Data → Refresh Now</p>
        </div>
      ) : (
        <>
          {/* Sort bar */}
          <div className="flex items-center gap-1 mb-3 text-xs text-slate-500">
            <span>Sort by:</span>
            {([
              { key: 'price_per_night', label: 'Price' },
              { key: 'rating', label: 'Rating' },
              { key: 'bedrooms', label: 'Bedrooms' },
            ] as { key: SortKey; label: string }[]).map(({ key, label }) => (
              <button
                key={key}
                onClick={() => toggleSort(key)}
                className={`px-2.5 py-1 rounded-md transition-colors ${
                  sortKey === key
                    ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30'
                    : 'bg-slate-800 text-slate-400 hover:text-white border border-slate-700'
                }`}
              >
                {label}
                <SortIcon active={sortKey === key} dir={sortDir} />
              </button>
            ))}
          </div>

          {/* Table */}
          <div className="bg-[#1e293b] border border-slate-700/50 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-700/50">
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 w-8">#</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-400">Name</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-400">Type</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-slate-400">Beds</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-slate-400">Rating</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-slate-400">Price/night</th>
                    <th className="px-4 py-3 w-8" />
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((c, i) => (
                    <tr key={c.listing_id} className="border-b border-slate-700/30 last:border-0 hover:bg-slate-800/40 transition-colors">
                      <td className="px-4 py-3 text-slate-500 text-xs">{i + 1}</td>
                      <td className="px-4 py-3">
                        <p className="text-slate-200 text-sm font-medium leading-snug max-w-xs truncate" title={c.name}>
                          {c.name || 'Airbnb listing'}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        {typeBadge(c.property_type)}
                      </td>
                      <td className="px-4 py-3 text-right text-slate-300">
                        {c.bedrooms != null ? `${c.bedrooms}br` : '—'}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {c.rating != null ? (
                          <span className="text-amber-400 text-xs">★ {c.rating.toFixed(2)}</span>
                        ) : (
                          <span className="text-slate-600">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="text-white font-semibold">{fmt(c.price_per_night)}</span>
                      </td>
                      <td className="px-4 py-3">
                        {c.url ? (
                          <a
                            href={c.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-400 hover:text-blue-300 transition-colors"
                            title="View on Airbnb"
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                            </svg>
                          </a>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="px-4 py-3 border-t border-slate-700/30 flex items-center justify-between">
              <p className="text-xs text-slate-500">
                {sorted.length} listings · entire homes only · Mon–Sun weekly pricing window · Airbnb via Apify
              </p>
              {activeData?.fetched_at && (
                <p className="text-xs text-slate-600">
                  {format(new Date(activeData.fetched_at), 'MMM d, yyyy h:mm a')}
                </p>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
