import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

/**
 * GET /api/debug/airroi?lat=38.5153&lng=-109.4892
 *
 * Step 1: GET /markets/lookup → returns locality/region/country (no ID)
 * Step 2: Try several POST bodies for /markets/summary to find what works
 */
export async function GET(request: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const apiKey = process.env.AIRROI_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'AIRROI_API_KEY not set' }, { status: 500 })

  const { searchParams } = new URL(request.url)
  const lat = parseFloat(searchParams.get('lat') ?? '38.5153')
  const lng = parseFloat(searchParams.get('lng') ?? '-109.4892')

  const BASE = 'https://api.airroi.com'
  const headers = { 'X-API-KEY': apiKey, 'Content-Type': 'application/json' }

  // Step 1: markets/lookup
  const lookupRes = await fetch(`${BASE}/markets/lookup?lat=${lat}&lng=${lng}`, {
    headers, signal: AbortSignal.timeout(12_000),
  })
  const lookupData = await lookupRes.json() as Record<string, unknown>
  const { full_name, locality, region, country, district } = lookupData as {
    full_name?: string; locality?: string; region?: string; country?: string; district?: string | null
  }

  // Step 2: try multiple POST bodies for /markets/summary
  const candidates = [
    // Maybe it just takes lat/lng
    { label: 'lat+lng', body: { lat, lng } },
    // Maybe the whole lookup response
    { label: 'full lookup object', body: lookupData },
    // Maybe locality + region
    { label: 'locality+region', body: { locality, region } },
    // Maybe locality + region + country
    { label: 'locality+region+country', body: { locality, region, country } },
    // Maybe full_name only
    { label: 'full_name', body: { full_name } },
    // Maybe location wrapper
    { label: 'location:{locality,region}', body: { location: { locality, region } } },
    // Maybe market:{locality,region}
    { label: 'market:{locality,region}', body: { market: { locality, region } } },
  ]

  const summaryResults = []
  for (const { label, body } of candidates) {
    try {
      const r = await fetch(`${BASE}/markets/summary`, {
        method: 'POST', headers,
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10_000),
      })
      const text = await r.text()
      let parsed: unknown = text
      try { parsed = JSON.parse(text) } catch { /* not json */ }
      summaryResults.push({ label, body, status: r.status, ok: r.ok, response: parsed })
      if (r.ok) break // stop on first success
    } catch (err) {
      summaryResults.push({ label, body, status: 0, ok: false, response: String(err) })
    }
  }

  // Also try the metrics/average-daily-rate and metrics/occupancy endpoints with lat+lng
  const metricsResults = []
  for (const metric of ['average-daily-rate', 'occupancy', 'revpar']) {
    try {
      const r = await fetch(`${BASE}/markets/metrics/${metric}`, {
        method: 'POST', headers,
        body: JSON.stringify({ lat, lng }),
        signal: AbortSignal.timeout(10_000),
      })
      const text = await r.text()
      let parsed: unknown = text
      try { parsed = JSON.parse(text) } catch { /* not json */ }
      metricsResults.push({ endpoint: `/markets/metrics/${metric}`, status: r.status, ok: r.ok, response: parsed })
    } catch (err) {
      metricsResults.push({ endpoint: `/markets/metrics/${metric}`, status: 0, ok: false, response: String(err) })
    }
  }

  return NextResponse.json({
    step1_lookup: { status: lookupRes.status, ok: lookupRes.ok, data: lookupData },
    step2_summary_attempts: summaryResults,
    step2_metrics_attempts: metricsResults,
    api_key_prefix: apiKey.slice(0, 6) + '...',
  })
}
