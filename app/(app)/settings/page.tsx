'use client'

import { useState, useEffect, useCallback } from 'react'
import { useToast } from '@/components/toast'
import { AMENITIES } from '@/lib/types'
import type { Property, PropertyFormData, Platform, CsvImport } from '@/lib/types'
import { format } from 'date-fns'

// ─── Apify Billing Section ────────────────────────────────────────────────────

const APIFY_SUBSCRIPTION_USD = 30 // hardcoded monthly plan cost

interface ApifyUsage {
  usageUsd: number
  runCount?: number
  cycleStart: string | null
  cycleEnd: string | null
}

function ApifyBillingSection() {
  const [usage, setUsage] = useState<ApifyUsage | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/apify-usage')
      .then((r) => (r.ok ? r.json() : r.json().then((e: { error?: string }) => Promise.reject(e.error ?? 'Failed'))))
      .then((data: ApifyUsage) => setUsage(data))
      .catch((e: unknown) => setError(String(e)))
      .finally(() => setLoading(false))
  }, [])

  const totalUsd = APIFY_SUBSCRIPTION_USD + (usage?.usageUsd ?? 0)

  function fmt(n: number) {
    return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 })
  }

  function fmtDate(s: string | null) {
    if (!s) return '—'
    return format(new Date(s), 'MMM d, yyyy')
  }

  return (
    <div className="bg-[#1e293b] rounded-2xl border border-slate-700/50 p-6">
      <div className="flex items-start gap-3 mb-5">
        <div className="w-9 h-9 bg-orange-500/15 rounded-lg flex items-center justify-center shrink-0 mt-0.5">
          <svg className="w-5 h-5 text-orange-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
          </svg>
        </div>
        <div>
          <h2 className="text-lg font-semibold text-white">API Costs — This Month</h2>
          <p className="text-slate-400 text-sm mt-0.5">
            Competitor pricing data is powered by Apify. Usage updates in real time from your account.
          </p>
        </div>
      </div>

      {/* Cost breakdown */}
      <div className="bg-slate-800/60 rounded-xl border border-slate-700/40 overflow-hidden mb-4">
        <div className="divide-y divide-slate-700/40">
          {/* Subscription line */}
          <div className="flex items-center justify-between px-4 py-3">
            <div>
              <p className="text-sm font-medium text-white">Apify — Monthly Subscription</p>
              <p className="text-xs text-slate-400 mt-0.5">Starter plan · renews monthly</p>
            </div>
            <span className="text-sm font-semibold text-white">{fmt(APIFY_SUBSCRIPTION_USD)}</span>
          </div>

          {/* Usage line */}
          <div className="flex items-center justify-between px-4 py-3">
            <div>
              <p className="text-sm font-medium text-white">Apify — Compute Usage</p>
              <p className="text-xs text-slate-400 mt-0.5">
                {loading
                  ? 'Loading…'
                  : usage?.cycleStart
                  ? `${usage.runCount ?? 0} runs this cycle · ${fmtDate(usage.cycleStart)} – ${fmtDate(usage.cycleEnd)}`
                  : 'Current billing cycle'}
              </p>
            </div>
            <span className="text-sm font-semibold text-white">
              {loading ? (
                <span className="inline-block w-12 h-4 bg-slate-700 rounded animate-pulse" />
              ) : error ? (
                <span className="text-slate-500 text-xs">unavailable</span>
              ) : (
                fmt(usage?.usageUsd ?? 0)
              )}
            </span>
          </div>

          {/* Total */}
          <div className="flex items-center justify-between px-4 py-3.5 bg-slate-700/30">
            <p className="text-sm font-semibold text-white">Estimated Total</p>
            <span className="text-base font-bold text-white">
              {loading ? (
                <span className="inline-block w-16 h-5 bg-slate-600 rounded animate-pulse" />
              ) : (
                fmt(loading ? APIFY_SUBSCRIPTION_USD : totalUsd)
              )}
            </span>
          </div>
        </div>
      </div>

      {error && (
        <p className="text-xs text-slate-500 mb-4">
          Could not fetch live usage from Apify — check that <code className="bg-slate-800 px-1 rounded">APIFY_TOKEN</code> is set in Vercel environment variables.
        </p>
      )}

      {/* Info note */}
      <div className="flex items-start gap-2.5 bg-orange-500/5 border border-orange-500/20 rounded-lg px-4 py-3">
        <svg className="w-4 h-4 text-orange-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <p className="text-xs text-orange-300/80 leading-relaxed">
          Competitor data refreshes every 4 days via cron. Each run scrapes ~20 Airbnb listings per property.
          At current cadence, compute usage should stay well under $5/month on top of the subscription.
        </p>
      </div>
    </div>
  )
}

// ─── Market Data Refresh Section ──────────────────────────────────────────────

interface DataSources {
  apify: boolean
  airroiComparables: boolean
  airroiMarket: boolean
}

const DEFAULT_SOURCES: DataSources = { apify: true, airroiComparables: true, airroiMarket: true }
const SOURCES_KEY = 'dataSourceConfig'

function loadSources(): DataSources {
  if (typeof window === 'undefined') return DEFAULT_SOURCES
  try {
    const raw = localStorage.getItem(SOURCES_KEY)
    if (!raw) return DEFAULT_SOURCES
    return { ...DEFAULT_SOURCES, ...JSON.parse(raw) }
  } catch { return DEFAULT_SOURCES }
}

function saveSources(s: DataSources) {
  try { localStorage.setItem(SOURCES_KEY, JSON.stringify(s)) } catch { /* ignore */ }
}

function Toggle({ enabled, onChange, label, sublabel }: {
  enabled: boolean
  onChange: (v: boolean) => void
  label: string
  sublabel: string
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0">
        <p className="text-sm font-medium text-white">{label}</p>
        <p className="text-xs text-slate-400 mt-0.5">{sublabel}</p>
      </div>
      <button
        type="button"
        onClick={() => onChange(!enabled)}
        className={`relative shrink-0 w-10 h-5.5 rounded-full transition-colors duration-200 focus:outline-none ${
          enabled ? 'bg-blue-500' : 'bg-slate-600'
        }`}
        style={{ height: '22px', width: '40px' }}
        aria-checked={enabled}
        role="switch"
      >
        <span
          className={`absolute top-0.5 left-0.5 w-4.5 h-4.5 bg-white rounded-full shadow transition-transform duration-200 ${
            enabled ? 'translate-x-[18px]' : 'translate-x-0'
          }`}
          style={{ width: '18px', height: '18px' }}
        />
      </button>
    </div>
  )
}

function sourcesDescription(s: DataSources): string {
  const on = [s.apify && 'Apify', s.airroiComparables && 'AirROI Comparables', s.airroiMarket && 'AirROI Market Stats'].filter(Boolean)
  if (on.length === 0) return 'No sources selected — enable at least one below.'
  if (s.apify && s.airroiComparables) return 'Combined mode: Apify + AirROI listings merged for maximum accuracy. AirROI fills gaps when Apify hits its limit.'
  if (s.apify) return 'Apify only — scraping live Airbnb listings. AirROI comparables disabled.'
  if (s.airroiComparables) return 'AirROI comparables only — instant comparable listings without Apify cost.'
  return `${on.join(' + ')} enabled.`
}

interface RunEntry { propertyId: string; propertyName: string; slug: string; runId: string }
interface PollResult { runId: string; propertyId: string; slug: string; status: string; listings?: number; airroiMerged?: number; error?: string }
interface AirROIResult { propertyName: string; slug: string; success: boolean; adr: number | null; occupancy_rate: number | null; error?: string }
interface AirROIComparableResult { propertyName: string; slug: string; success: boolean; count: number; error?: string }

function MarketDataSection() {
  const [sources, setSources] = useState<DataSources>(DEFAULT_SOURCES)
  const [phase, setPhase] = useState<'idle' | 'starting' | 'polling' | 'done' | 'error'>('idle')
  const [runs, setRuns] = useState<RunEntry[]>([])
  const [pollResults, setPollResults] = useState<PollResult[]>([])
  const [apifyErrors, setApifyErrors] = useState<{ propertyName: string; error: string }[]>([])
  const [airroiResults, setAirroiResults] = useState<AirROIResult[]>([])
  const [airroiComparableResults, setAirroiComparableResults] = useState<AirROIComparableResult[]>([])
  const [fatalError, setFatalError] = useState<string | null>(null)
  const [elapsed, setElapsed] = useState(0)

  // Load persisted source toggles on mount
  useEffect(() => { setSources(loadSources()) }, [])

  function updateSource(key: keyof DataSources, value: boolean) {
    const next = { ...sources, [key]: value }
    setSources(next)
    saveSources(next)
  }

  function buildSourcesList(s: DataSources): string[] {
    const list: string[] = []
    if (s.apify) list.push('apify')
    if (s.airroiComparables) list.push('airroi-comparables')
    if (s.airroiMarket) list.push('airroi-market')
    return list
  }

  async function handleRefresh(slugs: string[] | null = null) {
    const enabledSources = buildSourcesList(sources)
    if (enabledSources.length === 0) {
      setFatalError('No data sources selected. Enable at least one source below before refreshing.')
      return
    }

    setPhase('starting')
    setFatalError(null)
    setPollResults([])
    setApifyErrors([])
    setAirroiResults([])
    setAirroiComparableResults([])
    setElapsed(0)

    try {
      const startRes = await fetch('/api/competitor-pricing/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...(slugs ? { slugs } : {}), sources: enabledSources }),
      })
      if (!startRes.ok) {
        const errData = await startRes.json().catch(() => ({ error: 'Start request failed' })) as { error?: string }
        throw new Error(errData.error ?? `HTTP ${startRes.status}`)
      }
      const startData = await startRes.json() as {
        success: boolean
        runs: RunEntry[]
        apifyErrors?: { propertyName: string; error: string }[]
        airroiResults?: AirROIResult[]
        airroiComparableResults?: AirROIComparableResult[]
        error?: string
      }
      if (!startData.success) throw new Error(startData.error ?? 'Unknown error from start route')

      setAirroiResults(startData.airroiResults ?? [])
      setAirroiComparableResults(startData.airroiComparableResults ?? [])
      setApifyErrors(startData.apifyErrors ?? [])

      if ((startData.runs ?? []).length === 0) {
        setPhase('done')
        return
      }

      setRuns(startData.runs)
      setPhase('polling')

      const runsParam = startData.runs.map((r) => `${r.runId}:${r.propertyId}:${r.slug}`).join(',')
      const startTime = Date.now()
      const maxPollTime = 5 * 60 * 1000

      const poll = async (): Promise<void> => {
        const elapsedMs = Date.now() - startTime
        setElapsed(Math.round(elapsedMs / 1000))
        if (elapsedMs > maxPollTime) {
          setPhase('done')
          setFatalError('Apify timed out after 5 minutes — AirROI data above was saved. Competitor listings may still be processing.')
          return
        }
        try {
          const pollRes = await fetch(`/api/competitor-pricing/poll?runs=${encodeURIComponent(runsParam)}`)
          if (!pollRes.ok) throw new Error(`Poll failed: HTTP ${pollRes.status}`)
          const pollData = await pollRes.json() as { allDone: boolean; results: PollResult[] }
          setPollResults(pollData.results)
          if (pollData.allDone) { setPhase('done'); return }
          await new Promise((resolve) => setTimeout(resolve, 10_000))
          return poll()
        } catch (err) {
          setPhase('done')
          setFatalError(err instanceof Error ? err.message : 'Polling failed')
        }
      }

      await poll()
    } catch (err) {
      setPhase('error')
      setFatalError(err instanceof Error ? err.message : 'Unknown error')
    }
  }

  const isActive = phase === 'starting' || phase === 'polling'
  const hasAnyResults = airroiResults.length > 0 || airroiComparableResults.length > 0 || pollResults.length > 0 || apifyErrors.length > 0

  const RefreshIcon = () => (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
    </svg>
  )
  const SpinIcon = () => (
    <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  )

  return (
    <div className="bg-[#1e293b] rounded-2xl border border-slate-700/50 p-6">

      {/* Header + refresh button */}
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <h2 className="text-lg font-semibold text-white">Competitor Market Data</h2>
          <p className="text-slate-400 text-sm mt-0.5">{sourcesDescription(sources)}</p>
        </div>
        <button
          type="button"
          onClick={() => handleRefresh(null)}
          disabled={isActive}
          className="shrink-0 flex items-center gap-2 bg-slate-700 hover:bg-slate-600 disabled:bg-slate-700/50 text-white font-medium rounded-lg px-4 py-2 text-sm transition-colors"
        >
          {isActive
            ? <><SpinIcon />{phase === 'starting' ? 'Starting…' : `Polling… ${elapsed}s`}</>
            : <><RefreshIcon />Sync Now</>}
        </button>
      </div>

      {/* Data source toggles */}
      <div className="bg-slate-800/50 border border-slate-700/40 rounded-xl p-4 mb-4 space-y-3">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Data Sources</p>
        <Toggle
          enabled={sources.apify}
          onChange={(v) => updateSource('apify', v)}
          label="Apify — Live Airbnb Scraper"
          sublabel="Scrapes real listings with actual nightly prices. Costs ~$0.10–0.50/run. Has monthly spending limits."
        />
        <div className="border-t border-slate-700/40" />
        <Toggle
          enabled={sources.airroiComparables}
          onChange={(v) => updateSource('airroiComparables', v)}
          label="AirROI — Comparable Listings"
          sublabel="Returns nearby comparable properties with pricing data. Instant, no scraping, uses AirROI credits."
        />
        <div className="border-t border-slate-700/40" />
        <Toggle
          enabled={sources.airroiMarket}
          onChange={(v) => updateSource('airroiMarket', v)}
          label="AirROI — Market Stats"
          sublabel="Aggregate ADR &amp; occupancy rate for your market. One API call per property per sync."
        />
      </div>

      {/* Per-property buttons */}
      {!isActive && (
        <div className="flex gap-2 mb-5">
          {[{ slug: 'moab', label: 'Moab only' }, { slug: 'bear-lake', label: 'Bear Lake only' }].map(({ slug, label }) => (
            <button
              key={slug}
              type="button"
              onClick={() => handleRefresh([slug])}
              disabled={isActive}
              className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-600 hover:border-slate-500 text-slate-300 hover:text-white rounded-lg px-3 py-1.5 text-xs font-medium transition-colors"
            >
              <RefreshIcon />{label}
            </button>
          ))}
        </div>
      )}

      {/* Apify polling progress */}
      {phase === 'polling' && (
        <div className="bg-blue-900/20 border border-blue-500/30 rounded-lg px-4 py-3 mb-4">
          <p className="text-blue-300 text-sm font-medium">Apify scraping… ({elapsed}s)</p>
          <p className="text-blue-400/70 text-xs mt-0.5">
            Scraping {runs.length} propert{runs.length === 1 ? 'y' : 'ies'} — typically 1–3 minutes. Keep this tab open.
          </p>
          {pollResults.length > 0 && (
            <div className="mt-3 space-y-1.5">
              {pollResults.map((r) => (
                <div key={r.runId} className="flex items-center gap-2">
                  {r.status === 'RUNNING' || r.status === 'READY'
                    ? <span className="w-2 h-2 bg-blue-400 rounded-full animate-pulse" />
                    : r.status === 'SUCCEEDED'
                    ? <span className="w-2 h-2 bg-emerald-400 rounded-full" />
                    : <span className="w-2 h-2 bg-red-400 rounded-full" />}
                  <span className="text-xs text-slate-300">
                    {runs.find((run) => run.runId === r.runId)?.propertyName ?? r.slug}
                    {' — '}
                    {r.status === 'SUCCEEDED'
                      ? `${r.listings} listings${r.airroiMerged ? ` (${r.airroiMerged} from AirROI merged)` : ''}`
                      : r.status === 'RUNNING' || r.status === 'READY' ? 'Running…' : r.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Results */}
      {(phase === 'done' || phase === 'error' || phase === 'starting') && hasAnyResults && (
        <div className="space-y-3 mb-4">

          {/* AirROI Market Stats */}
          {airroiResults.length > 0 && (
            <div>
              <p className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-1.5">AirROI Market Stats</p>
              <div className="space-y-1.5">
                {airroiResults.map((r) => (
                  <div key={r.propertyName} className={`flex items-start justify-between rounded-lg px-3 py-2.5 border ${r.success ? 'bg-emerald-900/20 border-emerald-600/40' : 'bg-red-900/20 border-red-500/40'}`}>
                    <div>
                      <p className={`text-sm font-medium ${r.success ? 'text-emerald-300' : 'text-red-300'}`}>{r.propertyName}</p>
                      {r.success
                        ? <p className="text-xs text-slate-400 mt-0.5">
                            {r.adr != null ? `ADR $${Math.round(r.adr)}` : 'ADR n/a'} · {r.occupancy_rate != null ? `${Math.round(r.occupancy_rate * 100)}% occupancy` : 'occupancy n/a'}
                          </p>
                        : <p className="text-xs text-red-400/80 mt-0.5 break-all">{r.error}</p>}
                    </div>
                    <span className={`text-xs font-medium shrink-0 ml-3 ${r.success ? 'text-emerald-400' : 'text-red-400'}`}>{r.success ? '✓ Updated' : '✗ Failed'}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* AirROI Comparable Listings */}
          {airroiComparableResults.length > 0 && (
            <div>
              <p className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-1.5">AirROI Comparable Listings</p>
              <div className="space-y-1.5">
                {airroiComparableResults.map((r) => (
                  <div key={r.propertyName} className={`flex items-start justify-between rounded-lg px-3 py-2.5 border ${r.success ? 'bg-emerald-900/20 border-emerald-600/40' : 'bg-red-900/20 border-red-500/40'}`}>
                    <div>
                      <p className={`text-sm font-medium ${r.success ? 'text-emerald-300' : 'text-red-300'}`}>{r.propertyName}</p>
                      {r.success
                        ? <p className="text-xs text-slate-400 mt-0.5">{r.count} comparable listings pulled</p>
                        : <p className="text-xs text-red-400/80 mt-0.5 break-all">{r.error}</p>}
                    </div>
                    <span className={`text-xs font-medium shrink-0 ml-3 ${r.success ? 'text-emerald-400' : 'text-red-400'}`}>{r.success ? `${r.count} listings` : '✗ Failed'}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Apify Competitor Listings */}
          {(pollResults.length > 0 || apifyErrors.length > 0) && (
            <div>
              <p className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-1.5">Apify Competitor Listings</p>
              <div className="space-y-1.5">
                {pollResults.map((r) => (
                  <div key={r.runId} className={`flex items-start justify-between rounded-lg px-3 py-2.5 border ${r.status === 'SUCCEEDED' ? 'bg-emerald-900/20 border-emerald-600/40' : 'bg-red-900/20 border-red-500/40'}`}>
                    <div>
                      <p className={`text-sm font-medium ${r.status === 'SUCCEEDED' ? 'text-emerald-300' : 'text-red-300'}`}>
                        {runs.find((run) => run.runId === r.runId)?.propertyName ?? r.slug}
                      </p>
                      {r.error && <p className="text-xs text-red-400/80 mt-0.5">{r.error}</p>}
                      {r.status === 'SUCCEEDED' && r.airroiMerged != null && r.airroiMerged > 0 && (
                        <p className="text-xs text-blue-400/70 mt-0.5">+ {r.airroiMerged} AirROI listings merged</p>
                      )}
                    </div>
                    <span className={`text-xs font-medium shrink-0 ml-3 ${r.status === 'SUCCEEDED' ? 'text-emerald-400' : 'text-red-400'}`}>
                      {r.status === 'SUCCEEDED' ? `${r.listings ?? 0} total` : '✗ Failed'}
                    </span>
                  </div>
                ))}
                {apifyErrors.map((e) => (
                  <div key={e.propertyName} className="flex items-start justify-between rounded-lg px-3 py-2.5 border bg-red-900/20 border-red-500/40">
                    <div>
                      <p className="text-sm font-medium text-red-300">{e.propertyName}</p>
                      <p className="text-xs text-red-400/80 mt-0.5 break-all">{e.error}</p>
                    </div>
                    <span className="text-xs font-medium text-red-400 shrink-0 ml-3">✗ Failed</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Apify skipped note */}
          {sources.apify && apifyErrors.length === 0 && pollResults.length === 0 && runs.length === 0 && phase === 'done' && (
            <div>
              <p className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-1.5">Apify Competitor Listings</p>
              <div className="rounded-lg px-3 py-2.5 border bg-slate-800/50 border-slate-600/40">
                <p className="text-sm text-slate-400">No Apify runs started — AirROI data above was saved.</p>
              </div>
            </div>
          )}
        </div>
      )}

      {fatalError && (
        <div className="bg-amber-900/20 border border-amber-500/40 rounded-lg px-4 py-3 mb-4">
          <p className="text-amber-300 text-sm whitespace-pre-wrap">{fatalError}</p>
        </div>
      )}

      <div className="flex items-start gap-2 text-xs text-slate-500">
        <svg className="w-3.5 h-3.5 shrink-0 mt-0.5 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        After syncing, open any calendar date to see competitor prices in the date panel.
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────

interface EmailLogEntry {
  id: string
  subject: string
  recipient: string
  status: string
  sender_used: string
  error_message: string | null
  created_at: string
}

function EmailDigestSection() {
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState<{ success: boolean; subject?: string; error?: string } | null>(null)
  const [emailLog, setEmailLog] = useState<EmailLogEntry[]>([])
  const [logLoading, setLogLoading] = useState(true)

  useEffect(() => {
    fetch('/api/email-log')
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => setEmailLog(data))
      .catch(() => setEmailLog([]))
      .finally(() => setLogLoading(false))
  }, [result])

  async function sendNow() {
    setSending(true)
    setResult(null)
    try {
      const res = await fetch('/api/digest/send-now')
      const data = await res.json()
      setResult(data)
    } catch (err) {
      setResult({ success: false, error: String(err) })
    } finally {
      setSending(false)
    }
  }

  function statusBadge(status: string) {
    const map: Record<string, string> = {
      sent: 'bg-emerald-500/10 text-emerald-400',
      fallback_used: 'bg-yellow-500/10 text-yellow-400',
      failed: 'bg-red-500/10 text-red-400',
      both_failed: 'bg-red-500/10 text-red-400',
    }
    const label: Record<string, string> = {
      sent: 'Sent',
      fallback_used: 'Fallback used',
      failed: 'Failed',
      both_failed: 'Failed',
    }
    const cls = map[status] ?? 'bg-slate-500/10 text-slate-400'
    return (
      <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium capitalize ${cls}`}>
        {label[status] ?? status}
      </span>
    )
  }

  return (
    <div className="bg-[#1e293b] rounded-2xl border border-slate-700/50 p-6">
      <div className="flex items-start justify-between gap-4 mb-5">
        <div>
          <h2 className="text-lg font-semibold text-white">Email Digest</h2>
          <p className="text-slate-400 text-sm mt-0.5">
            Sent every Friday at 3pm MST. Runs both properties through the rules engine, then Claude generates the digest.
          </p>
        </div>
        <button
          onClick={sendNow}
          disabled={sending}
          className="shrink-0 flex items-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-600/50 text-white font-medium rounded-lg px-4 py-2 text-sm transition-colors"
        >
          {sending ? (
            <>
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Sending…
            </>
          ) : (
            'Send Test Digest Now'
          )}
        </button>
      </div>

      {result && (
        <div className={`mb-5 rounded-lg px-4 py-3 text-sm font-medium ${
          result.success
            ? 'bg-emerald-900/20 border border-emerald-600/40 text-emerald-300'
            : 'bg-red-900/20 border border-red-500/40 text-red-300'
        }`}>
          {result.success
            ? `Digest sent successfully — "${result.subject}"`
            : `Error: ${result.error}`}
        </div>
      )}

      <h3 className="text-sm font-medium text-slate-300 mb-3">Past Digests</h3>
      {logLoading ? (
        <div className="h-16 bg-slate-800/50 rounded-lg animate-pulse" />
      ) : emailLog.length === 0 ? (
        <p className="text-slate-500 text-sm">No digests sent yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left border-b border-slate-700/50">
                <th className="pb-3 text-xs font-medium text-slate-400">Date</th>
                <th className="pb-3 text-xs font-medium text-slate-400">Subject</th>
                <th className="pb-3 text-xs font-medium text-slate-400">Status</th>
                <th className="pb-3 text-xs font-medium text-slate-400">Sender</th>
              </tr>
            </thead>
            <tbody>
              {emailLog.map((entry) => (
                <tr key={entry.id} className="border-b border-slate-700/30 last:border-0">
                  <td className="py-3 text-slate-400 whitespace-nowrap">
                    {format(new Date(entry.created_at), 'MMM d, yyyy h:mm a')}
                  </td>
                  <td className="py-3 text-slate-300 max-w-[240px] truncate" title={entry.subject}>
                    {entry.subject}
                  </td>
                  <td className="py-3">{statusBadge(entry.status)}</td>
                  <td className="py-3 text-slate-400 capitalize">{entry.sender_used?.replace('_', ' ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

const DEFAULT_MOAB: PropertyFormData = {
  name: 'Moab Property',
  location: 'Moab, UT',
  platform: 'both',
  base_price: 250,
  min_price: 150,
  max_price: 500,
  amenities: [],
  arches_timed_entry_active: false,
  notes: '',
}

const DEFAULT_BEAR_LAKE: PropertyFormData = {
  name: 'Bear Lake Property',
  location: 'Bear Lake / Garden City, UT',
  platform: 'both',
  base_price: 250,
  min_price: 150,
  max_price: 500,
  amenities: [],
  arches_timed_entry_active: false,
  notes: '',
}

function PropertyCard({
  title,
  data,
  isMoab,
  onChange,
  onSave,
  saving,
}: {
  title: string
  data: PropertyFormData
  isMoab: boolean
  onChange: (updated: PropertyFormData) => void
  onSave: () => void
  saving: boolean
}) {
  const toggle = (amenity: string) => {
    const updated = data.amenities.includes(amenity)
      ? data.amenities.filter(a => a !== amenity)
      : [...data.amenities, amenity]
    onChange({ ...data, amenities: updated })
  }

  return (
    <div className="bg-[#1e293b] rounded-2xl border border-slate-700/50 p-6">
      <h2 className="text-lg font-semibold text-white mb-5">{title}</h2>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1.5">Property Name</label>
          <input
            type="text"
            value={data.name}
            onChange={e => onChange({ ...data, name: e.target.value })}
            className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1.5">Location</label>
          <input
            type="text"
            value={data.location}
            onChange={e => onChange({ ...data, location: e.target.value })}
            className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1.5">Platform</label>
          <select
            value={data.platform}
            onChange={e => onChange({ ...data, platform: e.target.value as Platform })}
            className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="airbnb">Airbnb</option>
            <option value="vrbo">Vrbo</option>
            <option value="both">Both</option>
          </select>
        </div>
      </div>

      {/* Pricing */}
      <div className="grid grid-cols-3 gap-4 mb-4">
        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1.5">Base Price / Night</label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">$</span>
            <input
              type="number"
              min={0}
              value={data.base_price}
              onChange={e => onChange({ ...data, base_price: Number(e.target.value) })}
              className="w-full bg-slate-800 border border-slate-600 rounded-lg pl-7 pr-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1.5">Min Price / Night</label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">$</span>
            <input
              type="number"
              min={0}
              value={data.min_price}
              onChange={e => onChange({ ...data, min_price: Number(e.target.value) })}
              className="w-full bg-slate-800 border border-slate-600 rounded-lg pl-7 pr-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1.5">Max Price / Night</label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">$</span>
            <input
              type="number"
              min={0}
              value={data.max_price}
              onChange={e => onChange({ ...data, max_price: Number(e.target.value) })}
              className="w-full bg-slate-800 border border-slate-600 rounded-lg pl-7 pr-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>
      </div>

      {/* Amenities */}
      <div className="mb-4">
        <label className="block text-xs font-medium text-slate-400 mb-2">Amenities</label>
        <div className="flex flex-wrap gap-2">
          {AMENITIES.map(amenity => {
            const checked = data.amenities.includes(amenity)
            return (
              <button
                key={amenity}
                type="button"
                onClick={() => toggle(amenity)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors duration-150 ${
                  checked
                    ? 'bg-blue-600/20 border-blue-500/50 text-blue-400'
                    : 'bg-slate-800 border-slate-600 text-slate-400 hover:text-white hover:border-slate-500'
                }`}
              >
                {amenity}
              </button>
            )
          })}
        </div>
      </div>

      {/* Moab-only: Arches toggle */}
      {isMoab && (
        <div className="mb-4 flex items-center justify-between bg-slate-800/50 rounded-lg px-4 py-3 border border-slate-700/50">
          <div>
            <p className="text-sm font-medium text-white">Arches Timed Entry System Active</p>
            <p className="text-xs text-slate-400 mt-0.5">Affects pricing recommendations when entry permits are required</p>
          </div>
          <button
            type="button"
            onClick={() => onChange({ ...data, arches_timed_entry_active: !data.arches_timed_entry_active })}
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${
              data.arches_timed_entry_active ? 'bg-blue-600' : 'bg-slate-600'
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow transition duration-200 ${
                data.arches_timed_entry_active ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>
      )}

      {/* Notes */}
      <div className="mb-5">
        <label className="block text-xs font-medium text-slate-400 mb-1.5">Notes</label>
        <textarea
          value={data.notes}
          onChange={e => onChange({ ...data, notes: e.target.value })}
          rows={3}
          placeholder="Any additional notes about this property..."
          className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
        />
      </div>

      <button
        onClick={onSave}
        disabled={saving}
        className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-600/50 text-white font-medium rounded-lg px-4 py-2.5 text-sm transition-colors duration-150"
      >
        {saving ? (
          <>
            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Saving...
          </>
        ) : (
          'Save changes'
        )}
      </button>
    </div>
  )
}

function SetupWizard({ onComplete }: { onComplete: () => void }) {
  const [moab, setMoab] = useState<PropertyFormData>(DEFAULT_MOAB)
  const [bearLake, setBearLake] = useState<PropertyFormData>(DEFAULT_BEAR_LAKE)
  const [saving, setSaving] = useState(false)
  const { showToast } = useToast()

  const handleCreate = async () => {
    setSaving(true)
    try {
      const res = await fetch('/api/properties', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ properties: [moab, bearLake] }),
      })
      if (!res.ok) throw new Error('Failed to create properties')
      showToast('Properties created successfully!', 'success')
      onComplete()
    } catch {
      showToast('Failed to create properties. Please try again.', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-3xl mx-auto">
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center w-12 h-12 bg-blue-600/20 rounded-xl mb-4">
          <svg className="w-6 h-6 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
          </svg>
        </div>
        <h1 className="text-2xl font-semibold text-white mb-2">Welcome to STR Pricing Co-Pilot</h1>
        <p className="text-slate-400 text-sm max-w-md mx-auto">
          Let&apos;s set up your two properties before you get started. You can update these settings anytime.
        </p>
      </div>

      <div className="space-y-6">
        <PropertyCard
          title="Property 1 — Moab, UT"
          data={moab}
          isMoab={true}
          onChange={setMoab}
          onSave={handleCreate}
          saving={false}
        />
        <PropertyCard
          title="Property 2 — Bear Lake / Garden City, UT"
          data={bearLake}
          isMoab={false}
          onChange={setBearLake}
          onSave={handleCreate}
          saving={false}
        />

        <div className="flex justify-end">
          <button
            onClick={handleCreate}
            disabled={saving}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-600/50 text-white font-semibold rounded-lg px-6 py-3 text-sm transition-colors duration-150"
          >
            {saving ? (
              <>
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Creating properties...
              </>
            ) : (
              'Create properties & continue'
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function SettingsPage() {
  const [loading, setLoading] = useState(true)
  const [properties, setProperties] = useState<Property[]>([])
  const [moab, setMoab] = useState<PropertyFormData>(DEFAULT_MOAB)
  const [bearLake, setBearLake] = useState<PropertyFormData>(DEFAULT_BEAR_LAKE)
  const [savingMoab, setSavingMoab] = useState(false)
  const [savingBearLake, setSavingBearLake] = useState(false)
  const [imports, setImports] = useState<CsvImport[]>([])
  const { showToast } = useToast()

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [propsRes, importsRes] = await Promise.all([
        fetch('/api/properties'),
        fetch('/api/import'),
      ])
      if (propsRes.ok) {
        const data: Property[] = await propsRes.json()
        setProperties(data)
        const moabProp = data.find(p => p.location.toLowerCase().includes('moab'))
        const bearProp = data.find(p => !p.location.toLowerCase().includes('moab'))
        if (moabProp) setMoab({ ...moabProp })
        if (bearProp) setBearLake({ ...bearProp })
      }
      if (importsRes.ok) {
        const data: CsvImport[] = await importsRes.json()
        setImports(data)
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  const save = async (data: PropertyFormData, setSaving: (v: boolean) => void) => {
    setSaving(true)
    try {
      const res = await fetch('/api/properties', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ properties: [data] }),
      })
      if (!res.ok) throw new Error()
      showToast('Property saved successfully!', 'success')
      await loadData()
    } catch {
      showToast('Failed to save property. Please try again.', 'error')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="p-6 md:p-8 flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (properties.length === 0) {
    return (
      <div className="p-6 md:p-8">
        <SetupWizard onComplete={loadData} />
      </div>
    )
  }

  const moabProp = properties.find(p => p.location.toLowerCase().includes('moab'))
  const bearProp = properties.find(p => !p.location.toLowerCase().includes('moab'))

  return (
    <div className="p-6 md:p-8 max-w-3xl">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-white">Settings</h1>
        <p className="text-slate-400 mt-1">Configure your property details and pricing ranges</p>
      </div>

      <div className="space-y-6 mb-10">
        <PropertyCard
          title="Moab, UT"
          data={moab}
          isMoab={true}
          onChange={setMoab}
          onSave={() => save({ ...moab, id: moabProp?.id }, setSavingMoab)}
          saving={savingMoab}
        />
        <PropertyCard
          title="Bear Lake / Garden City, UT"
          data={bearLake}
          isMoab={false}
          onChange={setBearLake}
          onSave={() => save({ ...bearLake, id: bearProp?.id }, setSavingBearLake)}
          saving={savingBearLake}
        />
      </div>

      <div className="space-y-6">
      {/* Email Digest */}
      <EmailDigestSection />

      {/* Apify Billing */}
      <ApifyBillingSection />

      {/* Competitor Market Data Refresh */}
      <MarketDataSection />

      {/* Import history */}
      <div className="bg-[#1e293b] rounded-2xl border border-slate-700/50 p-6">
        <h2 className="text-lg font-semibold text-white mb-4">Import History</h2>
        {imports.length === 0 ? (
          <p className="text-slate-400 text-sm">No imports yet. Head to the Import page to upload your booking data.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b border-slate-700/50">
                  <th className="pb-3 text-xs font-medium text-slate-400">Date</th>
                  <th className="pb-3 text-xs font-medium text-slate-400">Property</th>
                  <th className="pb-3 text-xs font-medium text-slate-400">Platform</th>
                  <th className="pb-3 text-xs font-medium text-slate-400 text-right">Rows</th>
                  <th className="pb-3 text-xs font-medium text-slate-400 text-right">New</th>
                  <th className="pb-3 text-xs font-medium text-slate-400 text-right">Updated</th>
                  <th className="pb-3 text-xs font-medium text-slate-400 text-right">Cancelled</th>
                </tr>
              </thead>
              <tbody>
                {imports.map(imp => {
                  const prop = properties.find(p => p.id === imp.property_id)
                  return (
                    <tr key={imp.id} className="border-b border-slate-700/30 last:border-0">
                      <td className="py-3 text-slate-300">
                        {format(new Date(imp.imported_at), 'MMM d, yyyy')}
                      </td>
                      <td className="py-3 text-slate-300">{prop?.name ?? '—'}</td>
                      <td className="py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium capitalize ${
                          imp.platform === 'airbnb'
                            ? 'bg-red-500/10 text-red-400'
                            : 'bg-blue-500/10 text-blue-400'
                        }`}>
                          {imp.platform}
                        </span>
                      </td>
                      <td className="py-3 text-slate-300 text-right">{imp.rows_imported}</td>
                      <td className="py-3 text-emerald-400 text-right">{imp.new_bookings}</td>
                      <td className="py-3 text-yellow-400 text-right">{imp.updated_bookings}</td>
                      <td className="py-3 text-red-400 text-right">{imp.cancelled_bookings}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      </div>
    </div>
  )
}
