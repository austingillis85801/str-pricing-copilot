import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServerSupabaseClient } from '@/lib/supabase-server'

export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const property_id = searchParams.get('property_id')
  if (!property_id) {
    return NextResponse.json({ error: 'property_id is required' }, { status: 400 })
  }

  const supabase = createServerSupabaseClient()
  const now = new Date()
  const todayStr = now.toISOString().split('T')[0]
  // 6 months out
  const endDate = new Date(now.getFullYear(), now.getMonth() + 6, 0)
  const endStr = endDate.toISOString().split('T')[0]

  const [bookingsRes, entriesRes, eventsRes] = await Promise.all([
    // Active bookings that overlap the display window
    supabase
      .from('bookings')
      .select('id, check_in, check_out, nights, total_revenue, nightly_rate, status')
      .eq('property_id', property_id)
      .eq('status', 'active')
      .lte('check_in', endStr)
      .gte('check_out', todayStr),
    // Calendar entries for open date pricing
    supabase
      .from('calendar_entries')
      .select(
        'date, recommended_price_low, recommended_price_high, alert_level, suggested_discount, seasonal_multiplier'
      )
      .eq('property_id', property_id)
      .gte('date', todayStr)
      .lte('date', endStr),
    // Active events: global (property_id IS NULL) + events tagged to this property
    supabase
      .from('events')
      .select('id, name, event_date, end_date, event_type')
      .eq('is_active', true)
      .gte('event_date', todayStr)
      .lte('event_date', endStr)
      .or(`property_id.is.null,property_id.eq.${property_id}`),
  ])

  return NextResponse.json({
    bookings: bookingsRes.data ?? [],
    entries: entriesRes.data ?? [],
    events: eventsRes.data ?? [],
  })
}
