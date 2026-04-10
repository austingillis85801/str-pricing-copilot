import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { runWeatherEngine } from '@/lib/weather-engine'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const flags = await runWeatherEngine()
    return NextResponse.json(flags)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Weather engine failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
