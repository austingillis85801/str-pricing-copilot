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
                  ? `Cycle: ${fmtDate(usage.cycleStart)} – ${fmtDate(usage.cycleEnd)}`
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

interface RefreshResult {
  property: string
  status: string
  listings?: number
  error?: string
}

function MarketDataSection() {
  const [refreshing, setRefreshing] = useState(false)
  const [results, setResults] = useState<RefreshResult[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleRefresh() {
    setRefreshing(true)
    setResults(null)
    setError(null)
    try {
      const res = await fetch('/api/competitor-pricing/refresh', { method: 'POST' })
      const data = await res.json() as { success: boolean; results?: RefreshResult[]; error?: string }
      if (!data.success) throw new Error(data.error ?? 'Refresh failed')
      setResults(data.results ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setRefreshing(false)
    }
  }

  return (
    <div className="bg-[#1e293b] rounded-2xl border border-slate-700/50 p-6">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <h2 className="text-lg font-semibold text-white">Competitor Market Data</h2>
          <p className="text-slate-400 text-sm mt-0.5">
            Fetches ~20 live Airbnb listings near each property and caches them for 4 days.
            Auto-refreshes via cron — or trigger a manual refresh here.
          </p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="shrink-0 flex items-center gap-2 bg-slate-700 hover:bg-slate-600 disabled:bg-slate-700/50 text-white font-medium rounded-lg px-4 py-2 text-sm transition-colors"
        >
          {refreshing ? (
            <>
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Fetching…
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Refresh Now
            </>
          )}
        </button>
      </div>

      {refreshing && (
        <div className="bg-blue-900/20 border border-blue-500/30 rounded-lg px-4 py-3 mb-4">
          <p className="text-blue-300 text-sm font-medium">Fetching from Airbnb via Apify…</p>
          <p className="text-blue-400/70 text-xs mt-0.5">
            This scrapes live listings for both properties — takes 1–3 minutes. Please keep this tab open.
          </p>
        </div>
      )}

      {results && (
        <div className="space-y-2 mb-4">
          {results.map((r) => (
            <div
              key={r.property}
              className={`flex items-center justify-between rounded-lg px-4 py-3 border ${
                r.status === 'refreshed'
                  ? 'bg-emerald-900/20 border-emerald-600/40'
                  : 'bg-red-900/20 border-red-500/40'
              }`}
            >
              <div>
                <p className={`text-sm font-medium ${r.status === 'refreshed' ? 'text-emerald-300' : 'text-red-300'}`}>
                  {r.property}
                </p>
                {r.error && <p className="text-xs text-red-400/80 mt-0.5">{r.error}</p>}
              </div>
              <span className={`text-xs font-medium ${r.status === 'refreshed' ? 'text-emerald-400' : 'text-red-400'}`}>
                {r.status === 'refreshed' ? `✓ ${r.listings ?? 0} listings` : 'Failed'}
              </span>
            </div>
          ))}
        </div>
      )}

      {error && (
        <div className="bg-red-900/20 border border-red-500/40 rounded-lg px-4 py-3 mb-4">
          <p className="text-red-300 text-sm">{error}</p>
        </div>
      )}

      <div className="flex items-start gap-2 text-xs text-slate-500">
        <svg className="w-3.5 h-3.5 shrink-0 mt-0.5 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        After refreshing, open any calendar date to see competitor prices in the date panel.
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
