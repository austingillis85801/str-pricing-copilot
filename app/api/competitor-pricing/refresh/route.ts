import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getMarketSnapshot } from '@/lib/competitor-pricing'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import type { Property } from '@/lib/types'

// Give Apify plenty of time — two properties sequentially can take 2+ minutes
export const maxDuration = 300

export async function POST() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const supabase = createServerSupabaseClient()
    const { data: properties } = await supabase.from('properties').select('*')

    if (!properties?.length) {
      return NextResponse.json({ success: true, message: 'No properties found', results: [] })
    }

    const results: { property: string; status: string; listings?: number; error?: string }[] = []

    for (const prop of properties as Property[]) {
      const slug = prop.name.toLowerCase().includes('moab') ? 'moab' : 'bear-lake'
      try {
        const data = await getMarketSnapshot(prop.id, slug as 'moab' | 'bear-lake', true)
        results.push({ property: prop.name, status: 'refreshed', listings: data.competitors.length })
      } catch (err) {
        results.push({
          property: prop.name,
          status: 'failed',
          error: err instanceof Error ? err.message : String(err),
        })
      }
    }

    return NextResponse.json({ success: true, results })
  } catch (error) {
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 })
  }
}
