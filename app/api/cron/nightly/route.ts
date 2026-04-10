import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { runRulesEngine } from '@/lib/rules-engine'
import { runWeatherEngine } from '@/lib/weather-engine'

// Required for Vercel — Claude API + weather calls can take 30s+
export const maxDuration = 60

export async function GET(req: Request) {
  // Verify request originates from Vercel cron scheduler
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServerSupabaseClient()
  const { data: properties, error } = await supabase
    .from('properties')
    .select('id, name')
    .order('created_at', { ascending: true })

  if (error || !properties || properties.length === 0) {
    return NextResponse.json({ error: 'No properties found' }, { status: 404 })
  }

  const errors: string[] = []

  // Run rules engine for every property and weather engine concurrently
  const [rulesResults, weatherFlags] = await Promise.allSettled([
    Promise.all(
      properties.map(async (p) => {
        try {
          const output = await runRulesEngine(p.id)

          // Upsert recommended prices into calendar_entries
          const upsertRows = output.open_dates.map((d) => ({
            property_id: p.id,
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

          return { property: p.name, alerts: output.pricing_alerts.length }
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Unknown error'
          errors.push(`${p.name}: ${msg}`)
          return { property: p.name, alerts: 0, error: msg }
        }
      })
    ),
    runWeatherEngine().catch((err) => {
      errors.push(`Weather engine: ${err instanceof Error ? err.message : 'Unknown error'}`)
      return []
    }),
  ])

  return NextResponse.json({
    ran_at: new Date().toISOString(),
    properties_processed: (rulesResults.status === 'fulfilled' ? rulesResults.value : []),
    weather_flags: (weatherFlags.status === 'fulfilled' ? weatherFlags.value.length : 0),
    errors,
  })
}
