import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

/**
 * GET /api/debug/airroi?lat=38.5153&lng=-109.4892
 *
 * Tests the correct AirROI two-step flow:
 *   1. GET /markets/lookup  → get market ID
 *   2. POST /markets/summary → get ADR + occupancy
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
  const headers = { 'X-API-KEY': apiKey, 'Content-Type': 'application/json' }

  // Step 1: markets/lookup
  let lookupRaw: unknown = null
  let marketId: string | null = null

  try {
    const r = await fetch(`${BASE}/markets/lookup?lat=${lat}&lng=${lng}`, {
      headers,
      signal: AbortSignal.timeout(12_000),
    })
    const text = await r.text()
    try { lookupRaw = JSON.parse(text) } catch { lookupRaw = text }

    if (r.ok && lookupRaw && typeof lookupRaw === 'object') {
      const obj = lookupRaw as Record<string, unknown>
      const inner = (obj.data ?? obj) as Record<string, unknown>
      marketId = String(inner.id ?? inner.marketId ?? inner.market_id ?? '')
      if (!marketId) marketId = null
    }

    return NextResponse.json({
      step1_lookup: {
        status: r.status,
        ok: r.ok,
        market_id_found: marketId,
        raw: lookupRaw,
      },
      step2_summary: marketId
        ? await (async () => {
            const r2 = await fetch(`${BASE}/markets/summary`, {
              method: 'POST',
              headers,
              body: JSON.stringify({ marketId }),
              signal: AbortSignal.timeout(12_000),
            })
            const t2 = await r2.text()
            let parsed: unknown = t2
            try { parsed = JSON.parse(t2) } catch { /* not json */ }
            return { status: r2.status, ok: r2.ok, raw: parsed }
          })()
        : { skipped: true, reason: 'no market ID from step 1' },
      api_key_prefix: apiKey.slice(0, 6) + '...',
    })
  } catch (err) {
    return NextResponse.json({
      error: String(err),
      step1_lookup: { raw: lookupRaw },
      api_key_prefix: apiKey.slice(0, 6) + '...',
    }, { status: 500 })
  }
}
