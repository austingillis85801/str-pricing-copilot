import { createServerSupabaseClient } from '@/lib/supabase-server'
import {
  startApifyRun,
  checkApifyRun,
  fetchApifyResults,
  buildMarketSnapshot,
  writeCache,
  PROPERTY_COORDS,
} from '@/lib/competitor-pricing'
import type { Property } from '@/lib/types'

// Vercel Hobby allows 60s max — we start runs and poll within that window.
// Each poll is fast (<2s). We poll up to ~50s then report what we have.
export const maxDuration = 60

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 })
  }

  try {
    const supabase = createServerSupabaseClient()
    const { data: properties } = await supabase.from('properties').select('*')

    if (!properties?.length) {
      return Response.json({ success: true, message: 'No properties found' })
    }

    const results: { property: string; status: string; listings?: number; error?: string }[] = []

    // Start all runs first (fast, <3s each)
    const runs: { prop: Property; slug: string; runId: string }[] = []
    for (const prop of properties as Property[]) {
      const slug = prop.name.toLowerCase().includes('moab') ? 'moab' : 'bear-lake'
      const coords = PROPERTY_COORDS[slug]
      if (!coords) continue

      try {
        const runId = await startApifyRun(coords.airbnbSearchUrl)
        runs.push({ prop, slug, runId })
      } catch (err) {
        results.push({
          property: prop.name,
          status: 'start_failed',
          error: err instanceof Error ? err.message : String(err),
        })
      }
    }

    // Poll for completion — give up after ~45s to stay within 60s limit
    const deadline = Date.now() + 45_000
    const pending = new Set(runs.map((r) => r.runId))

    while (pending.size > 0 && Date.now() < deadline) {
      await sleep(8_000) // wait 8s between polls

      for (const run of runs) {
        if (!pending.has(run.runId)) continue

        try {
          const { status, datasetId } = await checkApifyRun(run.runId)

          if (status === 'SUCCEEDED' && datasetId) {
            const coords = PROPERTY_COORDS[run.slug]
            const listings = await fetchApifyResults(datasetId, 20, coords ? {
              propertyLat: coords.lat,
              propertyLng: coords.lng,
              propertyBedrooms: coords.bedrooms,
              maxMiles: coords.maxMiles,
            } : {})
            const market = buildMarketSnapshot(listings)
            if (listings.length > 0) {
              await writeCache(run.prop.id, run.slug, listings, market)
            }
            results.push({ property: run.prop.name, status: 'refreshed', listings: listings.length })
            pending.delete(run.runId)
          } else if (status === 'FAILED' || status === 'ABORTED' || status === 'TIMED-OUT') {
            results.push({ property: run.prop.name, status: 'failed', error: `Run ${status}` })
            pending.delete(run.runId)
          }
          // else still RUNNING — keep polling
        } catch (err) {
          results.push({
            property: run.prop.name,
            status: 'poll_error',
            error: err instanceof Error ? err.message : String(err),
          })
          pending.delete(run.runId)
        }
      }
    }

    // Any still pending when we hit deadline
    for (const run of runs) {
      if (pending.has(run.runId)) {
        results.push({
          property: run.prop.name,
          status: 'still_running',
          error: 'Apify run still in progress — will be cached on next cron',
        })
      }
    }

    return Response.json({ success: true, results })
  } catch (error) {
    console.error('Market refresh cron failed:', error)
    return Response.json({ success: false, error: String(error) }, { status: 500 })
  }
}
