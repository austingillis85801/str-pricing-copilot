'use client'

import { useState } from 'react'
import type { RulesEngineOutput, AIAnalysis, AIRecommendation } from '@/lib/types'

interface AIRecommendationPanelProps {
  rulesOutput: RulesEngineOutput | null
  propertyId: string
}

function fmt(n: number | undefined) {
  if (!n) return null
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(n)
}

function RecommendationCard({
  rec,
  onApply,
  onDismiss,
}: {
  rec: AIRecommendation
  onApply: () => void
  onDismiss: () => void
}) {
  return (
    <div className="bg-slate-800 border border-slate-700 rounded-xl p-4">
      <div className="flex items-start gap-3">
        <div className="w-7 h-7 bg-blue-600/20 border border-blue-500/40 rounded-full flex items-center justify-center shrink-0 text-blue-400 text-xs font-bold">
          {rec.priority}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-white font-semibold text-sm">{rec.action}</p>
          <p className="text-slate-300 text-sm mt-1">{rec.detail}</p>
          {rec.dates && (
            <p className="text-slate-500 text-xs mt-1">{rec.dates}</p>
          )}
          {(rec.suggested_price || rec.current_price) && (
            <div className="flex items-center gap-3 mt-2">
              {rec.current_price && (
                <div className="text-xs">
                  <span className="text-slate-500">Current: </span>
                  <span className="text-slate-300 font-medium line-through">
                    {fmt(rec.current_price)}
                  </span>
                </div>
              )}
              {rec.suggested_price && (
                <div className="text-xs">
                  <span className="text-slate-500">Suggested: </span>
                  <span className="text-white font-semibold">{fmt(rec.suggested_price)}</span>
                </div>
              )}
            </div>
          )}
          <p className="text-slate-500 text-xs mt-2 italic">{rec.reason}</p>
        </div>
      </div>

      <div className="flex items-center gap-2 mt-3 pt-3 border-t border-slate-700">
        <button
          onClick={onApply}
          className="text-xs bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 border border-emerald-600/40 px-3 py-1.5 rounded-lg transition-colors"
        >
          Mark Applied
        </button>
        <button
          onClick={onDismiss}
          className="text-xs text-slate-400 hover:text-white border border-slate-600 hover:border-slate-500 px-3 py-1.5 rounded-lg transition-colors"
        >
          Dismiss
        </button>
        {/* TODO: Connect via Guesty Lite Open API. Note: if Guesty becomes the PMS, CSV imports should pull from Guesty rather than Airbnb/Vrbo directly to avoid data loop conflicts. */}
        <button
          disabled
          title="Automated price updates coming in a future release. Apply changes manually in your Airbnb/Vrbo hosting dashboard for now."
          className="ml-auto text-xs text-slate-600 border border-slate-700 px-3 py-1.5 rounded-lg cursor-not-allowed"
        >
          Push to Airbnb/Vrbo (Coming Soon)
        </button>
      </div>
    </div>
  )
}

export function AIRecommendationPanel({
  rulesOutput,
  propertyId,
}: AIRecommendationPanelProps) {
  const [analysis, setAnalysis] = useState<AIAnalysis | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dismissed, setDismissed] = useState<Set<number>>(new Set())
  const [applied, setApplied] = useState<Set<number>>(new Set())

  async function runAnalysis() {
    if (!rulesOutput) return
    setLoading(true)
    setError(null)
    setAnalysis(null)
    setDismissed(new Set())
    setApplied(new Set())

    try {
      // First get fresh rules engine output
      const rulesRes = await fetch('/api/rules-engine', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ property_id: propertyId }),
      })

      if (!rulesRes.ok) throw new Error('Failed to refresh rules engine data')
      const freshOutput: RulesEngineOutput = await rulesRes.json()

      // Then send to Claude
      const aiRes = await fetch('/api/ai-recommendations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(freshOutput),
      })

      if (!aiRes.ok) {
        const body = await aiRes.json().catch(() => ({}))
        throw new Error(body.error ?? 'AI analysis failed')
      }

      const result: AIAnalysis = await aiRes.json()
      setAnalysis(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  const visibleRecs =
    analysis?.recommendations.filter(
      (r) => !dismissed.has(r.priority) && !applied.has(r.priority)
    ) ?? []

  return (
    <div className="bg-slate-800 border border-slate-700 rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-white font-semibold">Claude&apos;s Analysis</h3>
          <p className="text-slate-400 text-sm mt-0.5">
            AI-powered pricing review for the next 30 days
          </p>
        </div>
        <button
          onClick={runAnalysis}
          disabled={loading || !rulesOutput}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-500 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors shrink-0"
        >
          {loading ? (
            <>
              <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Analyzing…
            </>
          ) : (
            <>
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
              Get AI Analysis
            </>
          )}
        </button>
      </div>

      {loading && (
        <div className="flex flex-col items-center justify-center py-10 text-center">
          <div className="w-8 h-8 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin mb-3" />
          <p className="text-slate-300 text-sm font-medium">Claude is reviewing your data…</p>
          <p className="text-slate-500 text-xs mt-1">This usually takes 15–30 seconds</p>
        </div>
      )}

      {error && (
        <div className="bg-red-900/20 border border-red-500/40 rounded-lg p-4 text-red-300 text-sm">
          <p className="font-medium">Analysis failed</p>
          <p className="mt-0.5 text-red-400">{error}</p>
        </div>
      )}

      {analysis && !loading && (
        <div className="space-y-4">
          {/* Overall assessment */}
          <div className="bg-slate-900/50 border border-slate-600 rounded-lg p-4">
            <p className="text-slate-400 text-xs font-medium uppercase tracking-wide mb-1">
              Overall Assessment
            </p>
            <p className="text-slate-200 text-sm leading-relaxed">{analysis.overall_assessment}</p>
          </div>

          {/* Recommendations */}
          {visibleRecs.length > 0 ? (
            <div className="space-y-3">
              {visibleRecs.map((rec) => (
                <RecommendationCard
                  key={rec.priority}
                  rec={rec}
                  onApply={() =>
                    setApplied((prev) => {
                      const next = new Set(prev)
                      next.add(rec.priority)
                      return next
                    })
                  }
                  onDismiss={() =>
                    setDismissed((prev) => {
                      const next = new Set(prev)
                      next.add(rec.priority)
                      return next
                    })
                  }
                />
              ))}
            </div>
          ) : (
            <p className="text-slate-400 text-sm text-center py-4">
              All recommendations have been addressed.
            </p>
          )}
        </div>
      )}

      {!analysis && !loading && !error && (
        <div className="flex flex-col items-center justify-center py-8 text-center border border-dashed border-slate-600 rounded-lg">
          <div className="w-10 h-10 bg-slate-700 rounded-xl flex items-center justify-center mb-3">
            <svg className="w-5 h-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
          </div>
          <p className="text-slate-400 text-sm">
            Click &ldquo;Get AI Analysis&rdquo; to have Claude review the next 30 days of pricing.
          </p>
        </div>
      )}
    </div>
  )
}
