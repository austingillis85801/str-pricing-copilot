import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import {
  startApifyRun,
  fetchAirROIMarket,
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

/**
 * POST /api/competitor-pricing/start
 *
 * Kicks off Apify actor runs AND AirROI market calls IN PARALLEL for each property.
 * The two services are fully decoupled — if one fails the other still runs.
 *
 * Optional JSON body: { slugs: ['moab'] } — limits to specific properties.
 *
 * Returns:
 *   { runs }         — Apify run IDs (caller polls /api/competitor-pricing/poll)
 *   { apifyErrors }  — per-property Apify start failures with reason
 *   { airroiResults} — per-property AirROI results (success + data OR failure + reason)
 */
export async function POST(request: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Parse optional slug filter from request body
  let slugFilter: string[] | null = null
  try {
    const body = await request.json() as { slugs?: string[] }
    if (Array.isArray(body.slugs) && body.slugs.length > 0) slugFilter = body.slugs
  } catch {
    // No body or invalid JSON — refresh all (default behaviour)
  }

  try {
    const supabase = createServerSupabaseClient()
    const { data: properties } = await supabase.from('properties').select('*')

    if (!properties?.length) {
      return NextResponse.json({ success: true, runs: [], apifyErrors: [], airroiResults: [], message: 'No properties found' })
    }

    // Build filtered list of properties to process
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

    // ── Run Apify AND AirROI fully in parallel across all properties ──────────
    // Each property fires both its Apify start and its AirROI call concurrently.
    // A failure in one service does NOT cancel the other.
    await Promise.all(
      toProcess.map(async ({ prop, slug, coords }) => {
        const [apifyOutcome, airroiOutcome] = await Promise.allSettled([
          startApifyRun(coords.airbnbSearchUrl),
          fetchAirROIMarket(coords.lat, coords.lng),
        ])

        // ── Apify result ──────────────────────────────────────────────────────
        if (apifyOutcome.status === 'fulfilled') {
          runs.push({
            propertyId: prop.id,
            propertyName: prop.name,
            slug,
            runId: apifyOutcome.value,
          })
        } else {
          const reason = apifyOutcome.reason
          apifyErrors.push({
            propertyName: prop.name,
            error: reason instanceof Error ? reason.message : String(reason),
          })
        }

        // ── AirROI result ─────────────────────────────────────────────────────
        if (airroiOutcome.status === 'fulfilled') {
          const airroi = airroiOutcome.value
          airroiResults.push({
            propertyName: prop.name,
            slug,
            success: true,
            adr: airroi.adr,
            occupancy_rate: airroi.occupancy_rate,
          })

          // Cache AirROI market data immediately — even if Apify failed.
          // The poll route will overwrite this with the full snapshot (competitors
          // + AirROI) once Apify finishes. If Apify never finishes, this partial
          // cache ensures the digest and date slide-over still get market data.
          try {
            const market = buildMarketSnapshot([], airroi)
            await writeCache(prop.id, slug, [], market)
          } catch {
            // Non-fatal — AirROI result is still returned in response
          }
        } else {
          const reason = airroiOutcome.reason
          airroiResults.push({
            propertyName: prop.name,
            slug,
            success: false,
            adr: null,
            occupancy_rate: null,
            error: reason instanceof Error ? reason.message : String(reason),
          })
        }
      })
    )

    return NextResponse.json({ success: true, runs, apifyErrors, airroiResults })
  } catch (error) {
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 })
  }
}
