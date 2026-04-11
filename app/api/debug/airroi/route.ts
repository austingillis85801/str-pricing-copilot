import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

/**
 * GET /api/debug/airroi?lat=38.5153&lng=-109.4892
 *
 * Calls AirROI and returns the raw JSON response so we can identify field names.
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

  const url = `https://api.airroi.com/v1/market/data?lat=${lat}&lng=${lng}&radius=10&api_key=${encodeURIComponent(apiKey)}`

  try {
    const res = await fetch(url, {
      headers: { 'X-Api-Key': apiKey, 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(15_000),
    })

    const text = await res.text()
    let parsed: unknown
    try { parsed = JSON.parse(text) } catch { parsed = text }

    return NextResponse.json({
      status: res.status,
      ok: res.ok,
      url_called: url.replace(apiKey, '***'),
      raw_response: parsed,
      top_level_keys: parsed && typeof parsed === 'object' ? Object.keys(parsed as object) : [],
    })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
