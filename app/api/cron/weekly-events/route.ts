import { NextResponse } from 'next/server'
import { syncEvents } from '@/lib/event-aggregator'

// Required for Vercel — external API calls may be slow
export const maxDuration = 60

export async function GET(req: Request) {
  // Verify request originates from Vercel cron scheduler
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const result = await syncEvents()
    return NextResponse.json({
      ran_at: new Date().toISOString(),
      events_added: result.added,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Event sync failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
