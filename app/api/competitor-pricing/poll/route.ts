import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import {
  checkApifyRun,
  fetchApifyResults,
  fetchAirROIMarket,
  buildMarketSnapshot,
  writeCache,
  PROPERTY_COORDS,
} from '@/lib/competitor-pricing'

/**
 * GET /api/competitor-pricing/poll?runs=runId1:propertyId1:slug1,runId2:propertyId2:slug2
 *
 * Checks the status of each Apify run. If a run has SUCCEEDED, fetches
 * the dataset items and caches them in Supabase. Returns status for each run.
 *
 * Each individual poll is fast (<5s). Client calls this every 10s.
 */
export async function GET(request: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const runsParam = searchParams.get('runs')

  if (!runsParam) {
    return NextResponse.json({ error: 'runs parameter required' }, { status: 400 })
  }

  // Parse "runId:propertyId:slug,runId:propertyId:slug"
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
    error?: string
  }[] = []

  for (const { runId, propertyId, slug } of runEntries) {
    try {
      const { status, datasetId } = await checkApifyRun(runId)

      if (status === 'SUCCEEDED' && datasetId) {
        // Run finished — fetch results and cache them
        const coords = PROPERTY_COORDS[slug]
        const listings = await fetchApifyResults(datasetId, 20, coords ? {
          propertyLat: coords.lat,
          propertyLng: coords.lng,
          propertyBedrooms: coords.bedrooms,
          maxMiles: coords.maxMiles,
        } : {})
        // Also fetch AirROI market data (non-fatal — enriches occupancy/ADR)
        const airroi = coords
          ? await fetchAirROIMarket(coords.lat, coords.lng)
          : { adr: null, occupancy_rate: null }
        const market = buildMarketSnapshot(listings, airroi)

        if (listings.length > 0) {
          await writeCache(propertyId, slug, listings, market)
        }

        results.push({
          runId,
          propertyId,
          slug,
          status: 'SUCCEEDED',
          listings: listings.length,
        })
      } else if (status === 'FAILED' || status === 'ABORTED' || status === 'TIMED-OUT') {
        results.push({
          runId,
          propertyId,
          slug,
          status,
          error: `Apify run ${status.toLowerCase()}`,
        })
      } else {
        // Still running
        results.push({ runId, propertyId, slug, status })
      }
    } catch (err) {
      results.push({
        runId,
        propertyId,
        slug,
        status: 'ERROR',
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  // allDone = true when no runs are still RUNNING/READY
  const allDone = results.every(
    (r) => r.status !== 'RUNNING' && r.status !== 'READY'
  )

  return NextResponse.json({ allDone, results })
}
