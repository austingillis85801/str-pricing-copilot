import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const token = process.env.APIFY_TOKEN
  if (!token) {
    return NextResponse.json({ error: 'APIFY_TOKEN not configured' }, { status: 500 })
  }

  try {
    const res = await fetch(
      `https://api.apify.com/v2/users/me/usage/monthly?token=${token}`,
      { signal: AbortSignal.timeout(10_000) }
    )

    if (!res.ok) {
      return NextResponse.json({ error: `Apify API error ${res.status}` }, { status: 502 })
    }

    const raw = await res.json() as Record<string, unknown>

    // Apify returns: { data: { totalUsageUsd: 1.23, ... } }
    // Normalise across possible response shapes
    const data = (raw.data ?? raw) as Record<string, unknown>

    const usageUsd: number =
      typeof data.totalUsageUsd === 'number'
        ? data.totalUsageUsd
        : typeof data.monthlyUsageUsd === 'number'
        ? data.monthlyUsageUsd
        : typeof (data.total as Record<string, unknown>)?.USD === 'number'
        ? (data.total as Record<string, unknown>).USD as number
        : 0

    // Monthly cycle dates (may or may not be present)
    const cycleStart: string | null =
      typeof data.usageCycleStartAt === 'string'
        ? data.usageCycleStartAt
        : typeof (data.monthlyUsageCycle as Record<string, unknown>)?.startAt === 'string'
        ? (data.monthlyUsageCycle as Record<string, unknown>).startAt as string
        : null

    const cycleEnd: string | null =
      typeof data.usageCycleEndAt === 'string'
        ? data.usageCycleEndAt
        : typeof (data.monthlyUsageCycle as Record<string, unknown>)?.endAt === 'string'
        ? (data.monthlyUsageCycle as Record<string, unknown>).endAt as string
        : null

    return NextResponse.json({ usageUsd, cycleStart, cycleEnd })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch Apify usage' },
      { status: 500 }
    )
  }
}
