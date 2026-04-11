import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

/**
 * GET /api/debug/airroi?lat=38.5153&lng=-109.4892
 *
 * Probes multiple AirROI endpoint paths to find which ones return 200.
 * Session-guarded — only accessible when logged in.
 */
export async function GET(request: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const apiKey = process.env.AIRROI_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'AIRROI_API_KEY not set' }, { status: 500 })

  const { searchParams } = new URL(request.url)
  const lat = searchParams.get('lat') ?? '38.5153'
  const lng = searchParams.get('lng') ?? '-109.4892'

  const BASE = 'https://api.airroi.com'
  const headers = { 'X-Api-Key': apiKey, 'Content-Type': 'application/json' }

  // Probe a list of candidate endpoints
  const candidates = [
    // GET endpoints with coords in query string
    `${BASE}/v1/market/data?lat=${lat}&lng=${lng}&radius=10&api_key=${encodeURIComponent(apiKey)}`,
    `${BASE}/v1/markets/data?lat=${lat}&lng=${lng}&radius=10&api_key=${encodeURIComponent(apiKey)}`,
    `${BASE}/markets/data?lat=${lat}&lng=${lng}&radius=10&api_key=${encodeURIComponent(apiKey)}`,
    `${BASE}/v1/market?lat=${lat}&lng=${lng}&radius=10&api_key=${encodeURIComponent(apiKey)}`,
    `${BASE}/v1/markets?lat=${lat}&lng=${lng}&radius=10&api_key=${encodeURIComponent(apiKey)}`,
    `${BASE}/v1/market/summary?lat=${lat}&lng=${lng}&radius=10&api_key=${encodeURIComponent(apiKey)}`,
    `${BASE}/v1/markets/summary?lat=${lat}&lng=${lng}&radius=10&api_key=${encodeURIComponent(apiKey)}`,
    `${BASE}/v1/markets/lookup?lat=${lat}&lng=${lng}&radius=10&api_key=${encodeURIComponent(apiKey)}`,
    `${BASE}/v1/market/lookup?lat=${lat}&lng=${lng}&radius=10&api_key=${encodeURIComponent(apiKey)}`,
  ]

  const results: Array<{
    path: string
    status: number
    ok: boolean
    top_level_keys: string[]
    snippet: string
  }> = []

  for (const url of candidates) {
    try {
      const res = await fetch(url, {
        headers,
        signal: AbortSignal.timeout(10_000),
      })
      const text = await res.text()
      let parsed: Record<string, unknown> = {}
      try { parsed = JSON.parse(text) } catch { /* not json */ }

      results.push({
        path: url.replace(apiKey, '***').replace(BASE, ''),
        status: res.status,
        ok: res.ok,
        top_level_keys: Object.keys(parsed),
        snippet: text.slice(0, 300),
      })
    } catch (err) {
      results.push({
        path: url.replace(apiKey, '***').replace(BASE, ''),
        status: 0,
        ok: false,
        top_level_keys: [],
        snippet: String(err),
      })
    }
  }

  // Also try POST /v1/markets/lookup with body
  try {
    const postUrl = `${BASE}/v1/markets/lookup`
    const res = await fetch(postUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({ lat: parseFloat(lat), lng: parseFloat(lng), radius: 10 }),
      signal: AbortSignal.timeout(10_000),
    })
    const text = await res.text()
    let parsed: Record<string, unknown> = {}
    try { parsed = JSON.parse(text) } catch { /* not json */ }
    results.push({
      path: 'POST /v1/markets/lookup (body: {lat,lng,radius})',
      status: res.status,
      ok: res.ok,
      top_level_keys: Object.keys(parsed),
      snippet: text.slice(0, 300),
    })
  } catch (err) {
    results.push({ path: 'POST /v1/markets/lookup', status: 0, ok: false, top_level_keys: [], snippet: String(err) })
  }

  const working = results.filter(r => r.ok)

  return NextResponse.json({ working_endpoints: working, all_results: results })
}
