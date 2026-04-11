import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

const CU_PRICE_USD = 0.30 // Apify Starter plan rate: $0.30 per compute unit

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const token = process.env.APIFY_TOKEN
  if (!token) return NextResponse.json({ error: 'APIFY_TOKEN not configured' }, { status: 500 })

  try {
    // Get billing cycle start (1st of current month)
    const now = new Date()
    const cycleStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
    const cycleEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString()

    // Fetch recent runs (up to 200) — filter to current billing cycle
    const runsRes = await fetch(
      `https://api.apify.com/v2/actor-runs?token=${token}&limit=200&desc=true`,
      { signal: AbortSignal.timeout(15_000) }
    )

    let computeUsd = 0
    let runCount = 0

    if (runsRes.ok) {
      const runsData = await runsRes.json() as {
        data?: {
          items?: {
            startedAt?: string
            status?: string
            stats?: { computeUnits?: number }
          }[]
        }
      }

      const items = runsData.data?.items ?? []
      for (const run of items) {
        if (!run.startedAt) continue
        const startedAt = run.startedAt
        // Only count runs in current billing cycle
        if (startedAt >= cycleStart && startedAt < cycleEnd) {
          const cu = run.stats?.computeUnits ?? 0
          computeUsd += cu * CU_PRICE_USD
          runCount++
        }
      }
    }

    return NextResponse.json({
      usageUsd: Math.round(computeUsd * 100) / 100,
      runCount,
      cycleStart,
      cycleEnd,
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch Apify usage' },
      { status: 500 }
    )
  }
}
