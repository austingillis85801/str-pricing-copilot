import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import {
  startApifyRun,
  fetchAirROIMarket,
  fetchAirROIComparables,
  buildMarketSnapshot,
  writeCache,
  PROPERTY_COORDS,
} from '@/lib/competitor-pricing'
import type { Property } from '@/lib/types'

export interface AirROIResult {
  propertyName: string
  slug: string
  success: boolean
  adr: number | null
  occupancy_rate: number | null
  error?: string
}

export interface AirROIComparableResult {
  propertyName: string
  slug: string
  success: boolean
  count: number
  error?: string
}

/**
 * POST /api/competitor-pricing/start
 *
 * Kicks off data collection for each property using the selected sources.
 * All services run in parallel and are fully decoupled — if one fails the others still run.
 *
 * Body: {
 *   slugs?:   string[]  — limit to specific properties (default: all)
 *   sources?: string[]  — which services to use (default: all)
 *                         values: 'apify' | 'airroi-comparables' | 'airroi-market'
 * }
 *
 * Returns:
 *   runs                  — Apify run IDs (caller polls /api/competitor-pricing/poll)
 *   apifyErrors           — per-property Apify start failures with reason
 *   airroiResults         — per-property AirROI market stats results
 *   airroiComparableResults — per-property AirROI comparable listings results
 */
export async function POST(request: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Parse body — slugs filter + sources selector
  let slugFilter: string[] | null = null
  let enabledSources: string[] = ['apify', 'airroi-comparables', 'airroi-market']
  try {
    const body = await request.json() as { slugs?: string[]; sources?: string[] }
    if (Array.isArray(body.slugs) && body.slugs.length > 0) slugFilter = body.slugs
    if (Array.isArray(body.sources) && body.sources.length > 0) enabledSources = body.sources
  } catch {
    // No body or invalid JSON — use defaults
  }

  const useApify = enabledSources.includes('apify')
  const useAirROIComparables = enabledSources.includes('airroi-comparables')
  const useAirROIMarket = enabledSources.includes('airroi-market')

  try {
    const supabase = createServerSupabaseClient()
    const { data: properties } = await supabase.from('properties').select('*')

    if (!properties?.length) {
      return NextResponse.json({
        success: true, runs: [], apifyErrors: [],
        airroiResults: [], airroiComparableResults: [],
        message: 'No properties found',
      })
    }

    const toProcess = (properties as Property[])
      .map((prop) => {
        const slug = prop.name.toLowerCase().includes('moab') ? 'moab' : 'bear-lake'
        if (slugFilter && !slugFilter.includes(slug)) return null
        const coords = PROPERTY_COORDS[slug]
        if (!coords) return null
        return { prop, slug, coords }
      })
      .filter(Boolean) as { prop: Property; slug: string; coords: (typeof PROPERTY_COORDS)[string] }[]

    const runs: { propertyId: string; propertyName: string; slug: string; runId: string }[] = []
    const apifyErrors: { propertyName: string; error: string }[] = []
    const airroiResults: AirROIResult[] = []
    const airroiComparableResults: AirROIComparableResult[] = []

    await Promise.all(
      toProcess.map(async ({ prop, slug, coords }) => {
        // Build the list of tasks to run concurrently for this property
        const tasks = await Promise.allSettled([
          useApify
            ? startApifyRun(coords.airbnbSearchUrl)
            : Promise.resolve(null),
          useAirROIComparables
            ? fetchAirROIComparables(coords.lat, coords.lng, coords.bedrooms, coords.baths, coords.guests)
            : Promise.resolve(null),
          useAirROIMarket
            ? fetchAirROIMarket(coords.lat, coords.lng, coords.bedrooms)
            : Promise.resolve(null),
        ])

        const [apifyOutcome, comparablesOutcome, marketOutcome] = tasks

        // ── Apify ────────────────────────────────────────────────────────────
        if (useApify) {
          if (apifyOutcome.status === 'fulfilled' && apifyOutcome.value !== null) {
            runs.push({ propertyId: prop.id, propertyName: prop.name, slug, runId: apifyOutcome.value as string })
          } else if (apifyOutcome.status === 'rejected') {
            const reason = apifyOutcome.reason
            apifyErrors.push({
              propertyName: prop.name,
              error: reason instanceof Error ? reason.message : String(reason),
            })
          }
        }

        // ── AirROI Comparables ────────────────────────────────────────────────
        const comparableListings = (
          comparablesOutcome.status === 'fulfilled' && Array.isArray(comparablesOutcome.value)
            ? comparablesOutcome.value
            : []
        )
        if (useAirROIComparables) {
          if (comparablesOutcome.status === 'fulfilled') {
            airroiComparableResults.push({
              propertyName: prop.name, slug, success: true, count: comparableListings.length,
            })
          } else {
            const reason = comparablesOutcome.reason
            airroiComparableResults.push({
              propertyName: prop.name, slug, success: false, count: 0,
              error: reason instanceof Error ? reason.message : String(reason),
            })
          }
        }

        // ── AirROI Market Stats ───────────────────────────────────────────────
        const airroiMarket = (
          marketOutcome.status === 'fulfilled' && marketOutcome.value !== null
            ? marketOutcome.value as import('@/lib/competitor-pricing').AirROIMarketData
            : { adr: null, occupancy_rate: null, booking_lead_time: null, avg_length_of_stay: null, market_min_nights: null, active_listings_count: null, rev_par: null }
        )
        if (useAirROIMarket) {
          if (marketOutcome.status === 'fulfilled') {
            airroiResults.push({
              propertyName: prop.name, slug, success: true,
              adr: airroiMarket.adr, occupancy_rate: airroiMarket.occupancy_rate,
            })
          } else {
            const reason = marketOutcome.reason
            airroiResults.push({
              propertyName: prop.name, slug, success: false, adr: null, occupancy_rate: null,
              error: reason instanceof Error ? reason.message : String(reason),
            })
          }
        }

        // ── Write immediate cache ─────────────────────────────────────────────
        // If AirROI comparables or market data succeeded, cache immediately so
        // the app has data even if Apify never finishes.
        const hasComparables = comparableListings.length > 0
        const hasMarket = airroiMarket.adr !== null || airroiMarket.occupancy_rate !== null

        if ((hasComparables || hasMarket) && !useApify) {
          // Apify is off — write AirROI-only cache as the final result
          const market = buildMarketSnapshot(comparableListings, airroiMarket)
          await writeCache(prop.id, slug, comparableListings, market).catch(() => null)
        } else if (hasComparables || hasMarket) {
          // Apify is on but may take time — write partial cache now so market
          // data is available immediately. Poll route will overwrite with merged result.
          const market = buildMarketSnapshot(comparableListings, airroiMarket)
          await writeCache(prop.id, slug, comparableListings, market).catch(() => null)
        }
      })
    )

    return NextResponse.json({ success: true, runs, apifyErrors, airroiResults, airroiComparableResults })
  } catch (error) {
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 })
  }
}
