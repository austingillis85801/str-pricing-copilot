import { createServerSupabaseClient } from './supabase-server'
import { isWeekend, getMonthOccupancy, getActiveBookings, calculateNightlyRate, getDaysUntil } from './utils'
import type {
  Property,
  Booking,
  Event,
  RulesEngineOutput,
  OpenDateAnalysis,
  OrphanGap,
  UpcomingEvent,
  PricingAlert,
  SpecialWindow,
  CalendarStatus,
} from './types'

// ─── Lead Time Baselines ──────────────────────────────────────────────────────

// Average days between booking creation and check-in, by month
const MOAB_LEAD_TIMES: Record<number, number> = {
  1: 45, 2: 35, 3: 60, 4: 76, 5: 65, 6: 50,
  7: 45, 8: 45, 9: 60, 10: 55, 11: 40, 12: 40,
}

// Bear Lake: 75–120 days summer, 30 days off-season
const BEAR_LAKE_LEAD_TIMES: Record<number, number> = {
  1: 30, 2: 30, 3: 30, 4: 45, 5: 60, 6: 90,
  7: 120, 8: 120, 9: 75, 10: 30, 11: 30, 12: 30,
}

function getExpectedLeadTime(property: Property, month: number): number {
  return isMoabProperty(property)
    ? (MOAB_LEAD_TIMES[month] ?? 60)
    : (BEAR_LAKE_LEAD_TIMES[month] ?? 75)
}

function getDefaultLeadTime(property: Property): number {
  return isMoabProperty(property) ? 60 : 75
}

function isMoabProperty(property: Property): boolean {
  return property.name.toLowerCase().includes('moab')
}

// ─── Event Multiplier ─────────────────────────────────────────────────────────

function getEventMultiplier(event: Event): number {
  const name = event.name.toLowerCase()

  if (name.includes('easter jeep safari') || name.includes('jeep safari') ||
      name.includes('raspberry days') || name.includes('raspberry festival')) {
    return 1.70
  }
  if (name.includes('winterfest')) {
    return 1.20
  }
  if (name.includes('christmas') || name.includes("new year's") || name.includes('nye')) {
    return 1.50
  }
  if (name.includes('independence day') || name.includes('july 4') ||
      name.includes('4th of july') || name.includes('memorial day')) {
    return 1.27
  }
  if (name.includes('labor day') || name.includes('thanksgiving')) {
    return 1.32
  }
  if (name.includes('mlk') || name.includes('martin luther king') ||
      name.includes("president's day") || name.includes('presidents day') ||
      name.includes('columbus day') || name.includes("veterans day")) {
    return 1.17
  }
  if (event.event_type === 'school_break') {
    return 1.10
  }
  return 1.15 // generic event boost
}

// ─── Seasonal Multiplier ──────────────────────────────────────────────────────

function getSeasonalMultiplier(
  date: Date,
  property: Property,
  events: Event[]
): { multiplier: number; reason: string } {
  const month = date.getMonth() + 1
  const day = date.getDate()
  const dateStr = date.toISOString().split('T')[0]
  const moab = isMoabProperty(property)

  // 1. Check events table first — highest priority for premium events
  const overlappingEvent = events.find((e) => {
    const start = e.event_date
    const end = e.end_date ?? e.event_date
    return dateStr >= start && dateStr <= end
  })
  if (overlappingEvent) {
    const m = getEventMultiplier(overlappingEvent)
    if (m > 1.0) return { multiplier: m, reason: overlappingEvent.name }
  }

  // 2. Christmas / NYE window (Dec 22 – Jan 2) — hardcoded fallback
  if ((month === 12 && day >= 22) || (month === 1 && day <= 2)) {
    return { multiplier: 1.50, reason: 'Christmas/NYE window' }
  }

  // 3. July 4 window (Jul 2–6)
  if (month === 7 && day >= 2 && day <= 6) {
    return { multiplier: 1.27, reason: 'July 4th window' }
  }

  // 4. Property-specific dead zones (only if no event/holiday override above)
  if (moab) {
    // Summer dead zone: Jun 15 – Aug 15
    if ((month === 6 && day >= 15) || month === 7 || (month === 8 && day <= 15)) {
      return { multiplier: 0.85, reason: 'Moab summer dead zone' }
    }
    // Winter dead zone: Dec 15 – Feb 1 (Christmas window handled above for Dec 22+)
    if ((month === 12 && day >= 15) || (month === 1 && day >= 3) ||
        (month === 2 && day === 1)) {
      return { multiplier: 0.68, reason: 'Moab winter dead zone' }
    }
  } else {
    // Bear Lake off-season: Oct 24 – May 19
    if (
      (month === 10 && day >= 24) ||
      month === 11 || month === 12 ||
      month === 1 || month === 2 || month === 3 || month === 4 ||
      (month === 5 && day <= 19)
    ) {
      return { multiplier: 0.62, reason: 'Bear Lake off-season' }
    }
  }

  // 5. Standard weekend premium
  if (isWeekend(date)) {
    return { multiplier: 1.22, reason: 'Weekend premium' }
  }

  // 6. Standard weekday
  return { multiplier: 1.00, reason: 'Standard weekday' }
}

// ─── Orphan Gap Detection ─────────────────────────────────────────────────────

function detectOrphanGaps(bookings: Booking[], events: Event[]): OrphanGap[] {
  if (bookings.length < 2) return []

  const gaps: OrphanGap[] = []
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  // bookings are pre-sorted ascending by check_in from getActiveBookings()
  for (let i = 0; i < bookings.length - 1; i++) {
    const curr = bookings[i]
    const next = bookings[i + 1]

    const checkOut = new Date(curr.check_out + 'T00:00:00')
    const nextIn = new Date(next.check_in + 'T00:00:00')

    if (nextIn <= today) continue // gap already in the past

    const gapNights = Math.round((nextIn.getTime() - checkOut.getTime()) / (1000 * 60 * 60 * 24))
    if (gapNights < 1 || gapNights > 3) continue

    // Collect gap date strings
    const gapDates: string[] = []
    const d = new Date(checkOut)
    while (d < nextIn) {
      gapDates.push(d.toISOString().split('T')[0])
      d.setDate(d.getDate() + 1)
    }

    // Check if any gap date overlaps an active event
    const adjacentToEvent = gapDates.some((dateStr) =>
      events.some((e) => dateStr >= e.event_date && dateStr <= (e.end_date ?? e.event_date))
    )

    let suggestedDiscount: number
    let suggestedMinStay: number

    if (adjacentToEvent) {
      suggestedDiscount = 0  // hold price near events
      suggestedMinStay = 1
    } else if (gapNights === 1) {
      suggestedDiscount = 20
      suggestedMinStay = 1
    } else if (gapNights === 2) {
      suggestedDiscount = 12
      suggestedMinStay = 2
    } else {
      // 3-night shoulder gap
      suggestedDiscount = 7
      suggestedMinStay = 2
    }

    gaps.push({
      start_date: gapDates[0],
      end_date: gapDates[gapDates.length - 1],
      nights: gapNights,
      suggested_discount: suggestedDiscount,
      suggested_min_stay: suggestedMinStay,
      adjacent_to_event: adjacentToEvent,
      preceding_booking_id: curr.id,
      following_booking_id: next.id,
    })
  }

  return gaps
}

// ─── Special Windows ──────────────────────────────────────────────────────────

const SPECIAL_WINDOW_DEFS = [
  {
    name: '2026 Spring Superstorm',
    start_date: '2026-03-28',
    end_date: '2026-04-10',
    property: 'moab' as const,
    recommended_action:
      'Peak demand window for Moab. Set maximum rates and 3-night minimum. Ensure Arches timed entry links are current.',
  },
  {
    name: '2026 July 4 Super Window',
    start_date: '2026-07-01',
    end_date: '2026-07-06',
    property: 'both' as const,
    recommended_action:
      'Prime holiday window for both properties. Set 1.27× base rate minimum. Hold firm on pricing — do not discount.',
  },
  {
    name: '2026 Bear Lake Extended Season End',
    start_date: '2026-09-08',
    end_date: '2026-09-08',
    property: 'bear-lake' as const,
    recommended_action:
      'Final peak weekend of Bear Lake season. Hold full-season rates. Consider 2-night minimum.',
  },
  {
    name: '2027 Spring Superstorm',
    start_date: '2027-03-22',
    end_date: '2027-04-09',
    property: 'moab' as const,
    recommended_action:
      "Plan ahead: next year's peak Moab window. Ensure calendar is priced by January 2027.",
  },
]

function buildSpecialWindows(property: Property): SpecialWindow[] {
  const moab = isMoabProperty(property)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const horizon = new Date(today)
  horizon.setDate(horizon.getDate() + 180)

  return SPECIAL_WINDOW_DEFS
    .filter((w) => {
      const endDate = new Date(w.end_date)
      const startDate = new Date(w.start_date)
      return endDate >= today && startDate <= horizon
    })
    .map((w) => {
      const startDate = new Date(w.start_date)
      const daysUntilStart = Math.ceil(
        (startDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
      )
      const propertyApplicable =
        w.property === 'both' ||
        (w.property === 'moab' && moab) ||
        (w.property === 'bear-lake' && !moab)

      return {
        name: w.name,
        start_date: w.start_date,
        end_date: w.end_date,
        days_until_start: daysUntilStart,
        recommended_action: w.recommended_action,
        is_pricing_set: false, // resolved below with a DB check
        property_applicable: propertyApplicable,
      }
    })
}

// ─── Calendar Status ──────────────────────────────────────────────────────────

async function buildCalendarStatus(
  propertyId: string,
  property: Property,
  supabase: ReturnType<typeof createServerSupabaseClient>
): Promise<CalendarStatus> {
  const flags: string[] = []
  const now = new Date()
  const year = now.getFullYear()
  const moab = isMoabProperty(property)

  // January booking surge check
  const januarySurgeFlag = now.getMonth() + 1 === 1
  if (januarySurgeFlag) {
    flags.push('January Booking Surge Active — summer calendar should be priced')
  }

  // Summer dates (Jul–Aug) priced?
  const { data: summerEntries } = await supabase
    .from('calendar_entries')
    .select('current_price')
    .eq('property_id', propertyId)
    .gte('date', `${year}-07-01`)
    .lte('date', `${year}-08-31`)
    .not('current_price', 'is', null)
    .limit(1)

  const summerDatesPriced = (summerEntries?.length ?? 0) > 0
  if (!summerDatesPriced) {
    flags.push('Summer dates (Jul–Aug) not yet priced in calendar')
  }

  // Peak event windows priced?
  let peakEventWindowsPriced = true

  if (moab) {
    // Easter Jeep Safari window (~late March – early April)
    const { data: ejsEntries } = await supabase
      .from('calendar_entries')
      .select('current_price')
      .eq('property_id', propertyId)
      .gte('date', `${year}-03-25`)
      .lte('date', `${year}-04-15`)
      .not('current_price', 'is', null)
      .limit(1)

    if ((ejsEntries?.length ?? 0) === 0) {
      peakEventWindowsPriced = false
      flags.push('Easter Jeep Safari window not priced in calendar')
    }
  } else {
    // Raspberry Days (~early August, Bear Lake)
    const { data: raspEntries } = await supabase
      .from('calendar_entries')
      .select('current_price')
      .eq('property_id', propertyId)
      .gte('date', `${year}-08-05`)
      .lte('date', `${year}-08-12`)
      .not('current_price', 'is', null)
      .limit(1)

    if ((raspEntries?.length ?? 0) === 0) {
      peakEventWindowsPriced = false
      flags.push('Raspberry Days window not priced in calendar')
    }
  }

  // July 4 window priced? (applies to both properties)
  const { data: jul4Entries } = await supabase
    .from('calendar_entries')
    .select('current_price')
    .eq('property_id', propertyId)
    .gte('date', `${year}-07-01`)
    .lte('date', `${year}-07-06`)
    .not('current_price', 'is', null)
    .limit(1)

  if ((jul4Entries?.length ?? 0) === 0) {
    peakEventWindowsPriced = false
    flags.push('July 4th window not priced in calendar')
  }

  return { january_surge_flag: januarySurgeFlag, summer_dates_priced: summerDatesPriced, peak_event_windows_priced: peakEventWindowsPriced, flags }
}

// ─── Main Entry Point ─────────────────────────────────────────────────────────

export async function runRulesEngine(propertyId: string): Promise<RulesEngineOutput> {
  const supabase = createServerSupabaseClient()
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const todayStr = today.toISOString().split('T')[0]

  // Load property
  const { data: property, error: propErr } = await supabase
    .from('properties')
    .select('*')
    .eq('id', propertyId)
    .single()

  if (propErr || !property) throw new Error(`Property not found: ${propertyId}`)

  // Load active bookings (sorted ascending by check_in)
  const bookings = await getActiveBookings(propertyId)

  // Load events within ±14 days of today through +180 days (lookback catches ongoing multi-day events)
  const lookbackStr = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000)
    .toISOString()
    .split('T')[0]
  const horizonDate = new Date(today)
  horizonDate.setDate(horizonDate.getDate() + 180)
  const horizonStr = horizonDate.toISOString().split('T')[0]

  const { data: eventsData } = await supabase
    .from('events')
    .select('*')
    .eq('is_active', true)
    .gte('event_date', lookbackStr)
    .lte('event_date', horizonStr)

  const events: Event[] = eventsData || []

  // Average lead time from booking history
  const bookingsWithLead = bookings.filter((b) => b.lead_time !== null)
  const avgLeadTime =
    bookingsWithLead.length > 0
      ? Math.round(
          bookingsWithLead.reduce((s, b) => s + (b.lead_time ?? 0), 0) /
            bookingsWithLead.length
        )
      : getDefaultLeadTime(property)

  // Occupancy for this month and next
  const thisMonth = now.getMonth() + 1
  const thisYear = now.getFullYear()
  const nextMonthDate = new Date(thisYear, thisMonth, 1)

  const [occupancyThisMonth, occupancyNextMonth] = await Promise.all([
    getMonthOccupancy(propertyId, thisYear, thisMonth),
    getMonthOccupancy(propertyId, nextMonthDate.getFullYear(), nextMonthDate.getMonth() + 1),
  ])

  // Build set of booked dates from active bookings
  const bookedDates = new Set<string>()
  for (const booking of bookings) {
    const checkIn = new Date(booking.check_in + 'T00:00:00')
    const checkOut = new Date(booking.check_out + 'T00:00:00')
    const cur = new Date(checkIn)
    while (cur < checkOut) {
      bookedDates.add(cur.toISOString().split('T')[0])
      cur.setDate(cur.getDate() + 1)
    }
  }

  // ─── Analyze open dates (next 180 days) ────────────────────────────────────
  const openDates: OpenDateAnalysis[] = []
  const pricingAlerts: PricingAlert[] = []

  for (let i = 0; i < 180; i++) {
    const date = new Date(today)
    date.setDate(date.getDate() + i)
    const dateStr = date.toISOString().split('T')[0]

    if (bookedDates.has(dateStr)) continue

    const daysUntil = i
    const month = date.getMonth() + 1
    const expectedLeadTime = getExpectedLeadTime(property, month)
    const isBehindPace = daysUntil < expectedLeadTime

    // Find overlapping event for this date
    const overlappingEvent = events.find(
      (e) => dateStr >= e.event_date && dateStr <= (e.end_date ?? e.event_date)
    )

    // Seasonal multiplier and recommended price range
    const { multiplier } = getSeasonalMultiplier(date, property, events)
    const { low, high } = calculateNightlyRate(property.base_price, multiplier)

    // Discount trigger rules — most urgent wins
    let alertLevel: 'watch' | 'action' | null = null
    let suggestedDiscount = 0
    let alertReason = ''

    if (daysUntil >= 0 && daysUntil <= 3) {
      if (overlappingEvent) {
        alertLevel = 'watch'
        suggestedDiscount = 5
        alertReason = `3 days out — event (${overlappingEvent.name}) detected; hold price`
      } else {
        alertLevel = 'action'
        suggestedDiscount = 25
        alertReason = '3 days out, no event — urgent last-minute discount'
      }
    } else if (daysUntil <= 7) {
      alertLevel = 'action'
      suggestedDiscount = 17
      alertReason = '7 days out, still open'
    } else if (daysUntil >= 14 && daysUntil <= 21) {
      alertLevel = 'action'
      suggestedDiscount = 12
      alertReason = '14–21 days out, still open'
    } else if (daysUntil > 7 && daysUntil <= 21 && occupancyThisMonth < 50) {
      // Catches 8–13 day window when month occupancy is below threshold
      alertLevel = 'watch'
      suggestedDiscount = 7
      alertReason = 'Within 21 days, <50% month occupancy'
    } else if (daysUntil >= 28 && daysUntil <= 30 && isBehindPace) {
      alertLevel = 'watch'
      suggestedDiscount = 5
      alertReason = '28–30 days out, behind booking pace'
    }

    const analysis: OpenDateAnalysis = {
      date: dateStr,
      days_until_checkin: daysUntil,
      is_behind_pace: isBehindPace,
      alert_level: alertLevel,
      suggested_discount: suggestedDiscount,
      base_price: property.base_price,
      seasonal_multiplier: multiplier,
      recommended_price_low: low,
      recommended_price_high: high,
      event_name: overlappingEvent?.name,
      is_weekend: isWeekend(date),
    }

    openDates.push(analysis)

    if (alertLevel) {
      pricingAlerts.push({
        date: dateStr,
        alert_level: alertLevel,
        reason: alertReason,
        suggested_discount: suggestedDiscount,
        recommended_price_low: low,
        recommended_price_high: high,
      })
    }
  }

  // ─── Orphan gaps ───────────────────────────────────────────────────────────
  const orphanGaps = detectOrphanGaps(bookings, events)

  // ─── Upcoming events list ──────────────────────────────────────────────────
  const upcomingEvents: UpcomingEvent[] = events
    .filter((e) => e.event_date >= todayStr)
    .map((e) => ({
      id: e.id,
      name: e.name,
      event_date: e.event_date,
      end_date: e.end_date,
      event_type: e.event_type,
      days_until: getDaysUntil(new Date(e.event_date + 'T00:00:00')),
      multiplier: getEventMultiplier(e),
    }))

  // ─── Special windows ───────────────────────────────────────────────────────
  const specialWindows = buildSpecialWindows(property)

  // Resolve is_pricing_set for each applicable window
  for (const win of specialWindows) {
    if (!win.property_applicable) continue
    const { data: entries } = await supabase
      .from('calendar_entries')
      .select('current_price')
      .eq('property_id', propertyId)
      .gte('date', win.start_date)
      .lte('date', win.end_date)
      .not('current_price', 'is', null)
      .limit(1)
    win.is_pricing_set = (entries?.length ?? 0) > 0
  }

  // ─── Calendar status ───────────────────────────────────────────────────────
  const calendarStatus = await buildCalendarStatus(propertyId, property, supabase)

  return {
    property_id: propertyId,
    property_name: property.name,
    generated_at: now.toISOString(),
    occupancy_pct_this_month: occupancyThisMonth,
    occupancy_pct_next_month: occupancyNextMonth,
    avg_lead_time_days: avgLeadTime,
    open_dates: openDates,
    orphan_gaps: orphanGaps,
    upcoming_events: upcomingEvents,
    weather_flags: [], // populated separately by the weather engine
    pricing_alerts: pricingAlerts,
    special_windows: specialWindows,
    calendar_status: calendarStatus,
  }
}
