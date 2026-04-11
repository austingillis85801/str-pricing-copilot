import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getMarketSnapshot } from '@/lib/competitor-pricing'

// Apify can take 30–50s for a full scrape run
export const maxDuration = 60

export async function GET(request: Request) {
  const session = await getServerSession(authOptions)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const propertyId = searchParams.get('property_id')
  const slug = searchParams.get('slug') as 'moab' | 'bear-lake' | null
  const forceRefresh = searchParams.get('refresh') === 'true'

  if (!propertyId || !slug) {
    return NextResponse.json({ error: 'property_id and slug are required' }, { status: 400 })
  }

  if (slug !== 'moab' && slug !== 'bear-lake') {
    return NextResponse.json({ error: 'slug must be moab or bear-lake' }, { status: 400 })
  }

  try {
    const data = await getMarketSnapshot(propertyId, slug, forceRefresh)
    return NextResponse.json(data)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Competitor pricing fetch failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
