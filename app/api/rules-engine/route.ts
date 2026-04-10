import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { runRulesEngine } from '@/lib/rules-engine'

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { property_id: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { property_id } = body
  if (!property_id) {
    return NextResponse.json({ error: 'property_id is required' }, { status: 400 })
  }

  try {
    const output = await runRulesEngine(property_id)

    // Upsert recommended prices into calendar_entries (one row per open date)
    const supabase = createServerSupabaseClient()
    const upsertRows = output.open_dates.map((d) => ({
      property_id,
      date: d.date,
      recommended_price_low: d.recommended_price_low,
      recommended_price_high: d.recommended_price_high,
      seasonal_multiplier: d.seasonal_multiplier,
      alert_level: d.alert_level,
      suggested_discount: d.suggested_discount,
      updated_at: new Date().toISOString(),
    }))

    if (upsertRows.length > 0) {
      await supabase
        .from('calendar_entries')
        .upsert(upsertRows, { onConflict: 'property_id,date' })
    }

    return NextResponse.json(output)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Rules engine failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
