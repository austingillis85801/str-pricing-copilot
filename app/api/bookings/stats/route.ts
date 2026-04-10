import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import type { BookingStats } from '@/lib/types'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServerSupabaseClient()
  const now = new Date()

  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    .toISOString()
    .split('T')[0]
  const thisMonthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0)
    .toISOString()
    .split('T')[0]
  const lastYearStart = new Date(now.getFullYear() - 1, now.getMonth(), 1)
    .toISOString()
    .split('T')[0]
  const lastYearEnd = new Date(now.getFullYear() - 1, now.getMonth() + 1, 0)
    .toISOString()
    .split('T')[0]

  const [thisMonthRes, lastYearRes] = await Promise.all([
    supabase
      .from('bookings')
      .select('property_id, total_revenue')
      .eq('status', 'active')
      .gte('check_in', thisMonthStart)
      .lte('check_in', thisMonthEnd),
    supabase
      .from('bookings')
      .select('property_id, total_revenue')
      .eq('status', 'active')
      .gte('check_in', lastYearStart)
      .lte('check_in', lastYearEnd),
  ])

  const stats: Record<string, BookingStats> = {}

  for (const booking of thisMonthRes.data ?? []) {
    if (!stats[booking.property_id]) {
      stats[booking.property_id] = {
        this_month_revenue: 0,
        this_month_bookings: 0,
        last_year_revenue: 0,
        last_year_bookings: 0,
      }
    }
    stats[booking.property_id].this_month_revenue += booking.total_revenue ?? 0
    stats[booking.property_id].this_month_bookings += 1
  }

  for (const booking of lastYearRes.data ?? []) {
    if (!stats[booking.property_id]) {
      stats[booking.property_id] = {
        this_month_revenue: 0,
        this_month_bookings: 0,
        last_year_revenue: 0,
        last_year_bookings: 0,
      }
    }
    stats[booking.property_id].last_year_revenue += booking.total_revenue ?? 0
    stats[booking.property_id].last_year_bookings += 1
  }

  return NextResponse.json(stats)
}
