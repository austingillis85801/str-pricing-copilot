import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import type { Property } from '@/lib/types'
import type { CompetitorListing, MarketSnapshot } from '@/lib/competitor-pricing'

export interface PropertyCompetitorData {
  property_id: string
  property_name: string
  slug: string
  competitors: CompetitorListing[]
  market: MarketSnapshot | null
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
    const { data: marketRow } = await supabase
      .from('market_data')
      .select('slug, competitors, market_snapshot, fetched_at')
      .eq('property_id', prop.id)
      .order('fetched_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    results.push({
      property_id: prop.id,
      property_name: prop.name,
      slug: (marketRow?.slug as string) ?? (prop.name.toLowerCase().includes('moab') ? 'moab' : 'bear-lake'),
      competitors: (marketRow?.competitors as CompetitorListing[]) ?? [],
      market: (marketRow?.market_snapshot as MarketSnapshot) ?? null,
      fetched_at: (marketRow?.fetched_at as string) ?? null,
    })
  }

  return NextResponse.json(results)
}
