import Anthropic from '@anthropic-ai/sdk'
import { runRulesEngine } from './rules-engine'
import { runWeatherEngine } from './weather-engine'
import { getMarketSnapshot } from './competitor-pricing'
import { createServerSupabaseClient } from './supabase-server'
import { buildEmailHtml, type DigestData } from './email-template'
import type { Property, RulesEngineOutput, UpcomingEvent } from './types'

const client = new Anthropic()

const DIGEST_SYSTEM_PROMPT = `You are a pricing co-pilot for two Utah short-term rentals (Moab and Bear Lake).
You are generating a weekly Friday email digest for the property owner.
The Rules Engine has already calculated all data. You are the Executive Reviewer.
Do not calculate dates yourself. Interpret the pre-calculated data.
Always recommend manual price changes — never automation.

If market_snapshot data is provided, use it to compare the owner's recommended prices to the local competitor market.
The owner's goal is maximum price AND maximum occupancy — not just one or the other.
Flag if the owner is significantly above market on open dates close to check-in (cut risk),
or significantly below market on dates far out (raise opportunity).

Respond with valid JSON only, no markdown:
{
  "subject": "STR Pricing Digest — [brief summary of most important thing this week]",
  "weekly_snapshot": "2–3 sentences on overall status of both properties, mentioning market position if data is available",
  "top_actions": [
    { "property": "Moab or Bear Lake", "date": "specific date", "action": "plain English action", "urgency": "high or medium" }
  ],
  "demand_signals": "2–3 sentences about upcoming events and demand windows",
  "weather_summary": "1–2 sentences on any weather flags worth noting, or empty string if none",
  "top_recommendations": [
    { "recommendation": "plain English recommendation", "reasoning": "brief why" }
  ],
  "special_alert": null
}`

function toDateStr(d: Date): string {
  return d.toISOString().split('T')[0]
}

export async function generateWeeklyDigest(): Promise<{ subject: string; html: string }> {
  const supabase = createServerSupabaseClient()

  // Load all properties
  const { data: properties, error } = await supabase
    .from('properties')
    .select('*')
    .order('created_at')
  if (error || !properties?.length) {
    throw new Error('No properties found')
  }

  // Run rules engines for all properties + weather engine + market snapshots in parallel
  const rulesPromises = (properties as Property[]).map((p) => runRulesEngine(p.id))
  const marketPromises = (properties as Property[]).map((p) => {
    const slug = p.name.toLowerCase().includes('moab') ? 'moab' : 'bear-lake'
    return getMarketSnapshot(p.id, slug as 'moab' | 'bear-lake').catch(() => null)
  })
  const [rulesOutputs, weatherFlags, marketSnapshots] = await Promise.all([
    Promise.all(rulesPromises),
    runWeatherEngine(),
    Promise.all(marketPromises),
  ])

  // Build combined context for Claude
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const in28Days = toDateStr(new Date(today.getTime() + 28 * 24 * 60 * 60 * 1000))

  const propertyContexts = rulesOutputs.map((output: RulesEngineOutput, idx: number) => {
    // Top 5 most urgent open dates (action level, soonest first)
    const urgentDates = output.open_dates
      .filter((d) => d.alert_level === 'action')
      .sort((a, b) => a.days_until_checkin - b.days_until_checkin)
      .slice(0, 5)
      .map((d) => ({
        date: d.date,
        days_until: d.days_until_checkin,
        recommended_price_low: d.recommended_price_low,
        recommended_price_high: d.recommended_price_high,
        suggested_discount: d.suggested_discount,
        is_weekend: d.is_weekend,
        event_name: d.event_name ?? null,
      }))

    // Events in next 28 days
    const nearEvents = output.upcoming_events
      .filter((e: UpcomingEvent) => e.event_date <= in28Days)
      .map((e: UpcomingEvent) => ({
        name: e.name,
        event_date: e.event_date,
        days_until: e.days_until,
        multiplier: e.multiplier,
      }))

    // Market snapshot (null if fetch failed or APIFY_TOKEN not set)
    const marketData = marketSnapshots[idx]
    const marketContext = marketData
      ? {
          avg_competitor_price: marketData.market.avg_price,
          market_price_range: `${marketData.market.percentile_25}–${marketData.market.percentile_75}`,
          competitor_count: marketData.market.sample_size,
          market_occupancy_rate: marketData.market.market_occupancy_rate,
        }
      : null

    return {
      property_name: output.property_name,
      occupancy_pct_this_month: Math.round(output.occupancy_pct_this_month),
      occupancy_pct_next_month: Math.round(output.occupancy_pct_next_month),
      urgent_open_dates: urgentDates,
      orphan_gaps: output.orphan_gaps.slice(0, 3),
      upcoming_events: nearEvents,
      special_windows: output.special_windows,
      calendar_status: output.calendar_status,
      market_snapshot: marketContext,
    }
  })

  const combinedContext = {
    generated_at: new Date().toISOString(),
    properties: propertyContexts,
    weather_flags: weatherFlags.map((f) => ({
      property_name: f.property_name,
      type: f.type,
      message: f.message,
    })),
  }

  // Call Claude
  const response = await client.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: 1500,
    system: DIGEST_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: JSON.stringify(combinedContext) }],
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : ''

  let digestData: DigestData
  try {
    digestData = JSON.parse(text)
  } catch {
    throw new Error('Claude returned invalid JSON for digest')
  }

  const appUrl = process.env.NEXTAUTH_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? 'https://localhost:3000'
  const html = buildEmailHtml(digestData, appUrl)

  return { subject: digestData.subject, html }
}
