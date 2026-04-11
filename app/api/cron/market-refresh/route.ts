import { createServerSupabaseClient } from '@/lib/supabase-server'
import { getMarketSnapshot } from '@/lib/competitor-pricing'
import type { Property } from '@/lib/types'

// Apify runs for both properties + AirROI calls
export const maxDuration = 60

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

    const results: { property: string; status: string; error?: string }[] = []

    for (const prop of properties as Property[]) {
      const slug = prop.name.toLowerCase().includes('moab') ? 'moab' : 'bear-lake'
      try {
        await getMarketSnapshot(prop.id, slug as 'moab' | 'bear-lake', true)
        results.push({ property: prop.name, status: 'refreshed' })
      } catch (err) {
        results.push({
          property: prop.name,
          status: 'failed',
          error: err instanceof Error ? err.message : String(err),
        })
      }
    }

    return Response.json({ success: true, results })
  } catch (error) {
    console.error('Market refresh cron failed:', error)
    return Response.json({ success: false, error: String(error) }, { status: 500 })
  }
}
