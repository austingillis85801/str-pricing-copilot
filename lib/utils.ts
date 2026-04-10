import { createServerSupabaseClient } from './supabase-server'
import type { Booking, Event } from './types'

export function getDaysUntil(date: Date): number {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const target = new Date(date)
  target.setHours(0, 0, 0, 0)
  return Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
}

// Friday (5) or Saturday (6) night — typical STR check-in nights
export function isWeekend(date: Date): boolean {
  const day = date.getDay()
  return day === 5 || day === 6
}

export async function getMonthOccupancy(
  propertyId: string,
  year: number,
  month: number // 1-indexed
): Promise<number> {
  const supabase = createServerSupabaseClient()

  const monthStart = new Date(year, month - 1, 1)
  const nextMonthStart = new Date(year, month, 1)
  const daysInMonth = new Date(year, month, 0).getDate()

  const startStr = monthStart.toISOString().split('T')[0]
  const endStr = new Date(year, month, 0).toISOString().split('T')[0]

  // Bookings that overlap this month: check_in <= last day AND check_out > first day
  const { data } = await supabase
    .from('bookings')
    .select('check_in, check_out')
    .eq('property_id', propertyId)
    .eq('status', 'active')
    .lte('check_in', endStr)
    .gt('check_out', startStr)

  if (!data || data.length === 0) return 0

  const bookedDates = new Set<string>()
  for (const booking of data) {
    const checkIn = new Date(booking.check_in + 'T00:00:00')
    const checkOut = new Date(booking.check_out + 'T00:00:00')
    const effectiveStart = checkIn < monthStart ? monthStart : checkIn
    const effectiveEnd = checkOut > nextMonthStart ? nextMonthStart : checkOut

    let current = new Date(effectiveStart)
    while (current < effectiveEnd) {
      bookedDates.add(current.toISOString().split('T')[0])
      current.setDate(current.getDate() + 1)
    }
  }

  return Math.round((bookedDates.size / daysInMonth) * 100)
}

export async function getActiveBookings(propertyId: string): Promise<Booking[]> {
  const supabase = createServerSupabaseClient()
  const { data } = await supabase
    .from('bookings')
    .select('*')
    .eq('property_id', propertyId)
    .eq('status', 'active')
    .order('check_in', { ascending: true })

  return data || []
}

export async function getUpcomingEvents(days: number): Promise<Event[]> {
  const supabase = createServerSupabaseClient()
  const today = new Date()
  const todayStr = today.toISOString().split('T')[0]
  const future = new Date(today)
  future.setDate(future.getDate() + days)
  const futureStr = future.toISOString().split('T')[0]

  const { data } = await supabase
    .from('events')
    .select('*')
    .eq('is_active', true)
    .gte('event_date', todayStr)
    .lte('event_date', futureStr)
    .order('event_date', { ascending: true })

  return data || []
}

export function calculateNightlyRate(
  basePrice: number,
  multiplier: number
): { low: number; high: number } {
  const mid = basePrice * multiplier
  return {
    low: Math.round(mid * 0.9),
    high: Math.round(mid * 1.1),
  }
}
