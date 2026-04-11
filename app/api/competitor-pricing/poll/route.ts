import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import {
  checkApifyRun,
  fetchApifyResults,
  fetchAirROIMarket,
  buildMarketSnapshot,
  writeCache,
  readCache,
  mergeCompetitorListings,
  PROPERTY_COORDS,
} from '@/lib/competitor-pricing'

/**
 * GET /api/competitor-pricing/poll?runs=runId1:propertyId1:slug1,...
 *
 * Checks the status of each Apify run. When a run SUCCEEDS:
 *   1. Fetches Apify dataset items (filtered by distance + bedrooms)
 *   2. Reads any AirROI comparables already cached from the start phase
 *   3. Merges both sources — Apify takes priority for duplicate listing IDs
 *   4. Writes the combined result to Supabase cache
 */
export async function GET(request: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const runsParam = searchParams.get('runs')
  if (!runsParam) return NextResponse.json({ error: 'runs parameter required' }, { status: 400 })

  const runEntries = runsParam.split(',').map((entry) => {
    const [runId, propertyId, slug] = entry.split(':')
    return { runId, propertyId, slug }
  })

  const results: {
    runId: string
    propertyId: string
    slug: string
    status: string
    listings?: number
    airroiMerged?: number
    error?: string
  }[] = []

  for (const { runId, propertyId, slug } of runEntries) {
    try {
      const { status, datasetId } = await checkApifyRun(runId)

      if (status === 'SUCCEEDED' && datasetId) {
        const coords = PROPERTY_COORDS[slug]

        // Fetch Apify results (distance + bedroom filtered)
        const apifyListings = await fetchApifyResults(datasetId, 20, coords ? {
          propertyLat: coords.lat,
          propertyLng: coords.lng,
          propertyBedrooms: coords.bedrooms,
          maxMiles: coords.maxMiles,
        } : {})

        // Read any AirROI comparables already written to cache by the start route
        const existingCache = await readCache(propertyId)
        const airroiListings = (existingCache?.competitors ?? []).filter((l) => l.platform === 'airroi')

        // Merge: Apify primary, AirROI fills gaps for listings not in Apify
        const mergedListings = airroiListings.length > 0
          ? mergeCompetitorListings(apifyListings, airroiListings)
          : apifyListings

        // Fetch AirROI market stats for ADR + occupancy enrichment
        const airroi = coords
          ? await fetchAirROIMarket(coords.lat, coords.lng, coords.bedrooms)
          : { adr: null, occupancy_rate: null }

        const market = buildMarketSnapshot(mergedListings, airroi)

        if (mergedListings.length > 0) {
          await writeCache(propertyId, slug, mergedListings, market)
        }

        results.push({
          runId, propertyId, slug,
          status: 'SUCCEEDED',
          listings: mergedListings.length,
          airroiMerged: airroiListings.length,
        })
      } else if (status === 'FAILED' || status === 'ABORTED' || status === 'TIMED-OUT') {
        results.push({ runId, propertyId, slug, status, error: `Apify run ${status.toLowerCase()}` })
      } else {
        results.push({ runId, propertyId, slug, status })
      }
    } catch (err) {
      results.push({
        runId, propertyId, slug, status: 'ERROR',
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  const allDone = results.every((r) => r.status !== 'RUNNING' && r.status !== 'READY')
  return NextResponse.json({ allDone, results })
}
