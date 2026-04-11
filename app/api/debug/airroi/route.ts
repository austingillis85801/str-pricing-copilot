import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

/**
 * GET /api/debug/airroi?lat=38.5153&lng=-109.4892
 *
 * Probes multiple AirROI base URLs + paths to find what actually works.
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

  const headers = { 'X-Api-Key': apiKey, 'Content-Type': 'application/json' }

  // Try different base URLs × common paths
  const baseUrls = [
    'https://api.airroi.com',
    'https://airroi.com',
    'https://app.airroi.com',
    'https://data.airroi.com',
    'https://api.airroi.io',
    'https://airroi.io',
  ]

  const paths = [
    `/v1/market/data?lat=${lat}&lng=${lng}&radius=10&api_key=${encodeURIComponent(apiKey)}`,
    `/v1/markets/lookup?lat=${lat}&lng=${lng}&radius=10&api_key=${encodeURIComponent(apiKey)}`,
    `/api/v1/market/data?lat=${lat}&lng=${lng}&radius=10&api_key=${encodeURIComponent(apiKey)}`,
    `/api/market/data?lat=${lat}&lng=${lng}&radius=10&api_key=${encodeURIComponent(apiKey)}`,
    `/market/data?lat=${lat}&lng=${lng}&radius=10&api_key=${encodeURIComponent(apiKey)}`,
  ]

  const results: Array<{
    url: string
    status: number
    ok: boolean
    top_level_keys: string[]
    snippet: string
  }> = []

  for (const base of baseUrls) {
    for (const path of paths.slice(0, 2)) { // only first 2 paths per base to stay fast
      const url = base + path
      try {
        const res = await fetch(url, {
          headers,
          signal: AbortSignal.timeout(8_000),
        })
        const text = await res.text()
        let parsed: Record<string, unknown> = {}
        try { parsed = JSON.parse(text) } catch { /* not json */ }

        results.push({
          url: url.replace(apiKey, '***'),
          status: res.status,
          ok: res.ok,
          top_level_keys: Object.keys(parsed),
          snippet: text.slice(0, 200),
        })

        // If we found a working one, stop early
        if (res.ok) break
      } catch (err) {
        results.push({
          url: url.replace(apiKey, '***'),
          status: 0,
          ok: false,
          top_level_keys: [],
          snippet: `NETWORK ERROR: ${String(err).slice(0, 100)}`,
        })
      }
    }
  }

  // Also try hitting the bare root of each base to see if it responds at all
  const rootResults: Array<{ base: string; status: number; reachable: boolean; snippet: string }> = []
  for (const base of baseUrls) {
    try {
      const res = await fetch(`${base}/`, { headers, signal: AbortSignal.timeout(5_000) })
      const text = await res.text()
      rootResults.push({ base, status: res.status, reachable: true, snippet: text.slice(0, 100) })
    } catch (err) {
      rootResults.push({ base, status: 0, reachable: false, snippet: String(err).slice(0, 100) })
    }
  }

  const working = results.filter(r => r.ok)

  return NextResponse.json({
    api_key_present: !!apiKey,
    api_key_length: apiKey.length,
    api_key_prefix: apiKey.slice(0, 6) + '...',
    working_endpoints: working,
    reachable_bases: rootResults.filter(r => r.reachable),
    all_results: results,
    root_probes: rootResults,
  })
}
