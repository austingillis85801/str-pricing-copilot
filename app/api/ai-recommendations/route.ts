import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import Anthropic from '@anthropic-ai/sdk'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import type { RulesEngineOutput, AIAnalysis } from '@/lib/types'

// Claude API can take 15–30s for complex analysis
export const maxDuration = 60

const client = new Anthropic()

const SYSTEM_PROMPT = `You are a pricing co-pilot for short-term rental properties in Utah.
You are the Executive Reviewer. The Rules Engine has already calculated all dates,
gaps, lead times, and price recommendations. Your job is to interpret that
pre-calculated data, prioritize the top 3–5 actions, and explain them in plain English.
Do not calculate dates yourself — all math is already done.
Always recommend the owner manually applies changes — never suggest automation.

Respond with valid JSON only, no markdown:
{
  "overall_assessment": "2–3 sentence summary of property status",
  "recommendations": [
    {
      "priority": 1,
      "action": "short action title",
      "detail": "plain English explanation",
      "dates": "date range or specific date",
      "suggested_price": 285,
      "current_price": 220,
      "reason": "why this change"
    }
  ]
}`

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let rulesOutput: RulesEngineOutput
  try {
    rulesOutput = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (!rulesOutput?.property_id) {
    return NextResponse.json({ error: 'Invalid rules engine output' }, { status: 400 })
  }

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: `Analyze this rules engine output and provide pricing recommendations:\n\n${JSON.stringify(rulesOutput, null, 2)}`,
        },
      ],
    })

    const text = response.content[0].type === 'text' ? response.content[0].text : ''

    let parsed: AIAnalysis
    try {
      parsed = JSON.parse(text)
    } catch {
      return NextResponse.json({ error: 'Claude returned invalid JSON' }, { status: 500 })
    }

    // Save to pricing_recommendations table (best-effort — table may not exist yet)
    try {
      const supabase = createServerSupabaseClient()
      await supabase.from('pricing_recommendations').insert({
        property_id: rulesOutput.property_id,
        overall_assessment: parsed.overall_assessment,
        recommendations: parsed.recommendations,
        generated_at: new Date().toISOString(),
        status: 'active',
      })
    } catch {
      // Non-fatal — table may not be created yet
      console.warn('Could not save to pricing_recommendations table')
    }

    return NextResponse.json(parsed)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Claude API call failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
