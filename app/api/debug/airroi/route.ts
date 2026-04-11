import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

/**
 * GET /api/debug/airroi?lat=38.5153&lng=-109.4892&bedrooms=2
 *
 * Tests the correct AirROI two-step flow:
 *   1. GET /markets/search?latitude=&longitude= → get market {country,region,locality,district}
 *   2. POST /markets/summary with market + bedroom filter → get ADR + occupancy
 */
export async function GET(request: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const apiKey = process.env.AIRROI_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'AIRROI_API_KEY not set' }, { status: 500 })

  const { searchParams } = new URL(request.url)
  const lat = parseFloat(searchParams.get('lat') ?? '38.5153')
  const lng = parseFloat(searchParams.get('lng') ?? '-109.4892')
  const bedrooms = searchParams.get('bedrooms') ? parseInt(searchParams.get('bedrooms')!) : 2

  const BASE = 'https://api.airroi.com'
  const headers = { 'X-API-KEY': apiKey, 'Content-Type': 'application/json' }

  // Step 1: /markets/lookup with lat/lng (confirmed working — returns country/region/locality)
  let marketData: Record<string, unknown> = {}
  let step1Status = 0

  try {
    const r = await fetch(`${BASE}/markets/lookup?lat=${lat}&lng=${lng}`, {
      headers, signal: AbortSignal.timeout(12_000),
    })
    step1Status = r.status
    const text = await r.text()
    try { marketData = JSON.parse(text) } catch { marketData = { raw: text } }
  } catch (err) {
    return NextResponse.json({ error: `Step 1 failed: ${err}` }, { status: 500 })
  }

  const mkt = (marketData.data ?? marketData) as Record<string, unknown>
  const { country, region, locality, district } = mkt as {
    country?: string; region?: string; locality?: string; district?: string | null
  }

  // Step 2: /markets/summary with bedroom filter
  let summaryData: unknown = null
  let step2Status = 0

  if (country && region && locality) {
    try {
      const r = await fetch(`${BASE}/markets/summary`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          market: { country, region, locality, district: district ?? null },
          filter: {
            bedrooms: { range: [Math.max(0, bedrooms - 1), bedrooms + 1] },
            room_type: { eq: 'entire_home' },
          },
          num_months: 12,
          currency: 'usd',
        }),
        signal: AbortSignal.timeout(12_000),
      })
      step2Status = r.status
      const text = await r.text()
      try { summaryData = JSON.parse(text) } catch { summaryData = text }
    } catch (err) {
      summaryData = { error: String(err) }
    }
  }

  return NextResponse.json({
    step1_market_search: { status: step1Status, market: mkt },
    step2_summary: { status: step2Status, data: summaryData },
    api_key_prefix: apiKey.slice(0, 6) + '...',
  })
}
