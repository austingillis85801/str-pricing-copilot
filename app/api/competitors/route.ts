import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import type { Property } from '@/lib/types'
import { buildMarketSnapshot, type CompetitorListing, type MarketSnapshot, type AirROIMarketData } from '@/lib/competitor-pricing'

export interface PropertyCompetitorData {
  property_id: string
  property_name: string
  slug: string
  competitors: CompetitorListing[]           // ALL competitors (including excluded) for display
  excludedIds: string[]                       // listing_ids the user has excluded
  market: MarketSnapshot | null              // computed from NON-excluded competitors only
  fetched_at: string | null
}

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServerSupabaseClient()
  const { data: properties } = await supabase.from('properties').select('*').order('created_at')

  if (!properties?.length) return NextResponse.json([])

  const results: PropertyCompetitorData[] = []

  for (const prop of properties as Property[]) {
    const [marketRes, exclusionsRes] = await Promise.all([
      supabase
        .from('market_data')
        .select('slug, competitors, market_snapshot, fetched_at')
        .eq('property_id', prop.id)
        .order('fetched_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from('competitor_exclusions')
        .select('listing_id')
        .eq('property_id', prop.id),
    ])

    const allCompetitors = (marketRes.data?.competitors as CompetitorListing[]) ?? []
    const excludedIds = (exclusionsRes.data ?? []).map((e: { listing_id: string }) => e.listing_id)
    const excludedSet = new Set(excludedIds)

    // Re-compute market snapshot using only non-excluded competitors
    const activeCompetitors = allCompetitors.filter(c => !excludedSet.has(c.listing_id))
    const cachedSnapshot = marketRes.data?.market_snapshot as MarketSnapshot | null
    // Re-build snapshot with AirROI fields mapped to AirROIMarketData shape
    const market = cachedSnapshot
      ? buildMarketSnapshot(activeCompetitors, {
          adr: cachedSnapshot.market_adr ?? null,
          occupancy_rate: cachedSnapshot.market_occupancy_rate ?? null,
          booking_lead_time: cachedSnapshot.booking_lead_time ?? null,
          avg_length_of_stay: cachedSnapshot.avg_length_of_stay ?? null,
          market_min_nights: cachedSnapshot.market_min_nights ?? null,
          active_listings_count: cachedSnapshot.active_listings_count ?? null,
          rev_par: cachedSnapshot.rev_par ?? null,
        })
      : null

    results.push({
      property_id: prop.id,
      property_name: prop.name,
      slug: (marketRes.data?.slug as string) ?? (prop.name.toLowerCase().includes('moab') ? 'moab' : 'bear-lake'),
      competitors: allCompetitors,
      excludedIds,
      market,
      fetched_at: (marketRes.data?.fetched_at as string) ?? null,
    })
  }

  return NextResponse.json(results)
}
