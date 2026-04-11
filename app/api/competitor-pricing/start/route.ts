import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { startApifyRun, PROPERTY_COORDS } from '@/lib/competitor-pricing'
import type { Property } from '@/lib/types'

/**
 * POST /api/competitor-pricing/start
 * Kicks off Apify actor runs for both properties.
 * Returns run IDs instantly (<5s) — caller polls /api/competitor-pricing/poll.
 */
export async function POST() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const supabase = createServerSupabaseClient()
    const { data: properties } = await supabase.from('properties').select('*')

    if (!properties?.length) {
      return NextResponse.json({ success: true, runs: [], message: 'No properties found' })
    }

    const runs: { propertyId: string; propertyName: string; slug: string; runId: string }[] = []
    const errors: { propertyName: string; error: string }[] = []

    for (const prop of properties as Property[]) {
      const slug = prop.name.toLowerCase().includes('moab') ? 'moab' : 'bear-lake'
      const coords = PROPERTY_COORDS[slug]
      if (!coords) {
        errors.push({ propertyName: prop.name, error: `Unknown slug: ${slug}` })
        continue
      }

      try {
        const runId = await startApifyRun(coords.airbnbSearchUrl)
        runs.push({ propertyId: prop.id, propertyName: prop.name, slug, runId })
      } catch (err) {
        errors.push({ propertyName: prop.name, error: err instanceof Error ? err.message : String(err) })
      }
    }

    return NextResponse.json({ success: true, runs, errors })
  } catch (error) {
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 })
  }
}
