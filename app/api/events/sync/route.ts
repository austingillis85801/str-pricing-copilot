import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { syncEvents } from '@/lib/event-aggregator'

export async function POST() {
  const session = await getServerSession(authOptions)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const result = await syncEvents()
    return NextResponse.json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Event sync failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
