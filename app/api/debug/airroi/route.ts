import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

/**
 * GET /api/debug/airroi?lat=38.5153&lng=-109.4892&bedrooms=2&baths=2&guests=4
 *
 * Tests /listings/comparables and shows the full raw response so we can
 * identify field names and why 0 listings are returned.
 */
export async function GET(request: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const apiKey = process.env.AIRROI_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'AIRROI_API_KEY not set' }, { status: 500 })

  const { searchParams } = new URL(request.url)
  const lat   = searchParams.get('lat')       ?? '38.5153'
  const lng   = searchParams.get('lng')       ?? '-109.4892'
  const beds  = searchParams.get('bedrooms')  ?? '2'
  const baths = searchParams.get('baths')     ?? '2'
  const guests= searchParams.get('guests')    ?? '4'

  const BASE = 'https://api.airroi.com'
  const headers = { 'X-API-KEY': apiKey, 'Content-Type': 'application/json' }

  // Try several param name variants — docs may differ from actual API
  const attempts = [
    `${BASE}/listings/comparables?latitude=${lat}&longitude=${lng}&bedrooms=${beds}&baths=${baths}&guests=${guests}&currency=usd`,
    `${BASE}/listings/comparables?lat=${lat}&lng=${lng}&bedrooms=${beds}&baths=${baths}&guests=${guests}&currency=usd`,
    `${BASE}/listings/comparables?latitude=${lat}&longitude=${lng}&bedrooms=${beds}&bathrooms=${baths}&guests=${guests}&currency=usd`,
    `${BASE}/listings/comparables?latitude=${lat}&longitude=${lng}&bedrooms=${beds}&baths=${baths}&guests=${guests}`,
  ]

  const results = []
  for (const url of attempts) {
    try {
      const res = await fetch(url, { headers, signal: AbortSignal.timeout(12_000) })
      const text = await res.text()
      let parsed: unknown = text
      try { parsed = JSON.parse(text) } catch { /* not json */ }

      const topKeys = parsed && typeof parsed === 'object' ? Object.keys(parsed as object) : []

      // If it's an array or has a listings key, show first item keys too
      let firstItemKeys: string[] = []
      if (Array.isArray(parsed) && parsed.length > 0) {
        firstItemKeys = Object.keys(parsed[0] as object)
      } else if (parsed && typeof parsed === 'object') {
        const p = parsed as Record<string, unknown>
        const arr = p.listings ?? p.data ?? p.results
        if (Array.isArray(arr) && arr.length > 0) {
          firstItemKeys = Object.keys(arr[0] as object)
        }
      }

      results.push({
        url: url.replace(/api_key=[^&]+/, 'api_key=***'),
        status: res.status,
        ok: res.ok,
        top_level_keys: topKeys,
        first_item_keys: firstItemKeys,
        // Show full response if small, truncated if large
        raw: JSON.stringify(parsed).length < 3000 ? parsed : JSON.stringify(parsed).slice(0, 3000) + '…',
      })

      if (res.ok) break // stop on first success
    } catch (err) {
      results.push({ url, status: 0, ok: false, error: String(err) })
    }
  }

  return NextResponse.json({
    property: { lat, lng, bedrooms: beds, baths, guests },
    api_key_prefix: apiKey.slice(0, 6) + '...',
    attempts: results,
  })
}
