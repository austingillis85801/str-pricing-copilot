import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { differenceInDays, parseISO, isValid } from 'date-fns'

// ─────────────────────────────────────────────
// CSV parsing utilities
// ─────────────────────────────────────────────

function parseCsv(text: string): Record<string, string>[] {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')
  if (lines.length < 2) return []

  const headers = parseCsvLine(lines[0])
  const rows: Record<string, string>[] = []

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue
    const values = parseCsvLine(line)
    const row: Record<string, string> = {}
    headers.forEach((h, idx) => {
      row[h.trim()] = (values[idx] ?? '').trim()
    })
    rows.push(row)
  }
  return rows
}

function parseCsvLine(line: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current)
      current = ''
    } else {
      current += char
    }
  }
  result.push(current)
  return result
}

function parseDate(raw: string): string | null {
  if (!raw) return null
  // Try ISO first
  try {
    const d = parseISO(raw)
    if (isValid(d)) return d.toISOString().split('T')[0]
  } catch { /* continue */ }
  // Try MM/DD/YYYY
  const mdy = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (mdy) return `${mdy[3]}-${mdy[1].padStart(2, '0')}-${mdy[2].padStart(2, '0')}`
  return null
}

function parseMoney(raw: string): number {
  if (!raw) return 0
  const cleaned = raw.replace(/[$,\s]/g, '')
  const n = parseFloat(cleaned)
  return isNaN(n) ? 0 : n
}

function findColumn(row: Record<string, string>, candidates: string[]): string {
  for (const c of candidates) {
    const key = Object.keys(row).find(k => k.toLowerCase() === c.toLowerCase())
    if (key !== undefined) return row[key]
  }
  return ''
}

// ─────────────────────────────────────────────
// Platform-specific parsers
// ─────────────────────────────────────────────

interface ParsedBooking {
  external_booking_id: string
  check_in: string
  check_out: string
  nights: number
  total_revenue: number
  nightly_rate: number | null
  lead_time: number | null
  booking_date: string | null
}

function parseAirbnbCsv(rows: Record<string, string>[], listingFilter?: string): ParsedBooking[] {
  const results: ParsedBooking[] = []

  for (const row of rows) {
    const status = findColumn(row, ['Status', 'status'])
    // Skip anything cancelled — accept Confirmed, Currently hosting, Past guest, Review guest, etc.
    if (status.toLowerCase().includes('cancel')) continue
    // Skip rows with no meaningful status (empty rows, headers)
    if (!status) continue

    // If a listing filter is provided, only import rows matching that listing
    if (listingFilter) {
      const listing = findColumn(row, ['Listing', 'listing'])
      if (listing !== listingFilter) continue
    }

    const external_booking_id = findColumn(row, ['Confirmation code', 'confirmation code', 'Confirmation Code'])
    if (!external_booking_id) continue

    const checkInRaw  = findColumn(row, ['Start date', 'start date', 'Start Date'])
    const checkOutRaw = findColumn(row, ['End date', 'end date', 'End Date'])
    const check_in  = parseDate(checkInRaw)
    const check_out = parseDate(checkOutRaw)
    if (!check_in || !check_out) continue

    // Airbnb exports "# of nights" — also handle plain "Nights"
    const nightsRaw = findColumn(row, ['# of nights', '# Of Nights', 'Nights', 'nights'])
    let nights = parseInt(nightsRaw, 10)
    if (isNaN(nights) || nights <= 0) {
      nights = differenceInDays(parseISO(check_out), parseISO(check_in))
    }
    if (nights <= 0) continue

    // Airbnb exports "Earnings" — also handle "Payout", "Amount"
    const total_revenue = parseMoney(
      findColumn(row, ['Earnings', 'earnings', 'Payout', 'payout', 'Amount', 'amount'])
    )

    const bookingDateRaw = findColumn(row, ['Booked', 'booked', 'Booking date', 'booking date', 'Booking Date'])
    const booking_date = parseDate(bookingDateRaw)

    let lead_time: number | null = null
    if (booking_date && check_in) {
      lead_time = differenceInDays(parseISO(check_in), parseISO(booking_date))
      if (lead_time < 0) lead_time = null
    }

    const nightly_rate = nights > 0 && total_revenue > 0
      ? Math.round((total_revenue / nights) * 100) / 100
      : null

    results.push({ external_booking_id, check_in, check_out, nights, total_revenue, nightly_rate, lead_time, booking_date })
  }

  return results
}

function parseVrboCsv(rows: Record<string, string>[]): ParsedBooking[] {
  const results: ParsedBooking[] = []

  for (const row of rows) {
    const status = findColumn(row, ['Status', 'status', 'Booking status', 'booking status'])
    if (status.toLowerCase().includes('cancel')) continue

    const external_booking_id = findColumn(row, ['Confirmation number', 'confirmation number', 'Confirmation Number', 'Booking ID', 'booking id'])
    if (!external_booking_id) continue

    const checkInRaw = findColumn(row, ['Check-in', 'check-in', 'Check In', 'check in', 'Arrival', 'arrival'])
    const checkOutRaw = findColumn(row, ['Check-out', 'check-out', 'Check Out', 'check out', 'Departure', 'departure'])
    const check_in = parseDate(checkInRaw)
    const check_out = parseDate(checkOutRaw)
    if (!check_in || !check_out) continue

    const nightsRaw = findColumn(row, ['Nights', 'nights'])
    let nights = parseInt(nightsRaw, 10)
    if (isNaN(nights) || nights <= 0) {
      nights = differenceInDays(parseISO(check_out), parseISO(check_in))
    }
    if (nights <= 0) continue

    const total_revenue = parseMoney(
      findColumn(row, ['Gross earnings', 'gross earnings', 'Gross Earnings', 'Total', 'total', 'Amount', 'amount', 'Payout', 'payout'])
    )

    const bookingDateRaw = findColumn(row, ['Booking date', 'booking date', 'Booking Date', 'Booked', 'booked', 'Created', 'created'])
    const booking_date = parseDate(bookingDateRaw)

    let lead_time: number | null = null
    if (booking_date && check_in) {
      lead_time = differenceInDays(parseISO(check_in), parseISO(booking_date))
      if (lead_time < 0) lead_time = null
    }

    const nightly_rate = nights > 0 && total_revenue > 0 ? Math.round((total_revenue / nights) * 100) / 100 : null

    results.push({
      external_booking_id,
      check_in,
      check_out,
      nights,
      total_revenue,
      nightly_rate,
      lead_time,
      booking_date,
    })
  }

  return results
}

// ─────────────────────────────────────────────
// GET — list import history
// ─────────────────────────────────────────────

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServerSupabaseClient()
  const { data, error } = await supabase
    .from('csv_imports')
    .select('*')
    .order('imported_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// ─────────────────────────────────────────────
// DELETE — clear all bookings for a property + platform
// ─────────────────────────────────────────────

export async function DELETE(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const propertyId = searchParams.get('propertyId')
  const platform = searchParams.get('platform')

  if (!propertyId || !platform) {
    return NextResponse.json({ error: 'Missing propertyId or platform' }, { status: 400 })
  }

  const supabase = createServerSupabaseClient()

  // Verify property exists
  const { data: property, error: propError } = await supabase
    .from('properties')
    .select('id, name')
    .eq('id', propertyId)
    .single()

  if (propError || !property) {
    return NextResponse.json({ error: 'Property not found' }, { status: 404 })
  }

  const { error, count } = await supabase
    .from('bookings')
    .delete({ count: 'exact' })
    .eq('property_id', propertyId)
    .eq('platform', platform)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ deleted: count ?? 0, propertyName: property.name })
}

// ─────────────────────────────────────────────
// POST — process CSV upload
// ─────────────────────────────────────────────

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const formData = await req.formData()
  const file = formData.get('file') as File | null
  const propertyId = formData.get('propertyId') as string | null
  const platform = formData.get('platform') as 'airbnb' | 'vrbo' | null
  const listingName = (formData.get('listingName') as string | null) || undefined

  if (!file || !propertyId || !platform) {
    return NextResponse.json({ error: 'Missing required fields: file, propertyId, platform' }, { status: 400 })
  }

  const text = await file.text()
  const rows = parseCsv(text)

  if (rows.length === 0) {
    return NextResponse.json({ error: 'CSV file is empty or could not be parsed' }, { status: 400 })
  }

  const parsed = platform === 'airbnb' ? parseAirbnbCsv(rows, listingName) : parseVrboCsv(rows)

  if (parsed.length === 0) {
    return NextResponse.json({ error: 'No valid bookings found in the CSV. Check that the file format matches the expected export.' }, { status: 400 })
  }

  const supabase = createServerSupabaseClient()

  // Verify property exists
  const { data: property, error: propError } = await supabase
    .from('properties')
    .select('id, name')
    .eq('id', propertyId)
    .single()

  if (propError || !property) {
    return NextResponse.json({ error: 'Property not found' }, { status: 404 })
  }

  // ── Cancellation detection ──────────────────
  // Get all active future bookings for this property+platform
  const today = new Date().toISOString().split('T')[0]
  const { data: futureBookings } = await supabase
    .from('bookings')
    .select('id, external_booking_id')
    .eq('property_id', propertyId)
    .eq('platform', platform)
    .eq('status', 'active')
    .gte('check_in', today)

  const incomingIds = new Set(parsed.map(b => b.external_booking_id))
  const toCancel = (futureBookings ?? []).filter(b => !incomingIds.has(b.external_booking_id))

  let cancelledBookings = 0
  if (toCancel.length > 0) {
    const { error: cancelError } = await supabase
      .from('bookings')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .in('id', toCancel.map(b => b.id))
    if (!cancelError) cancelledBookings = toCancel.length
  }

  // ── Upsert bookings ─────────────────────────
  let newBookings = 0
  let updatedBookings = 0
  const dbErrors: string[] = []

  for (const booking of parsed) {
    // Check if booking already exists for this property+platform
    const { data: existing } = await supabase
      .from('bookings')
      .select('id')
      .eq('property_id', propertyId)
      .eq('platform', platform)
      .eq('external_booking_id', booking.external_booking_id)
      .single()

    const record = {
      property_id: propertyId,
      platform,
      external_booking_id: booking.external_booking_id,
      check_in: booking.check_in,
      check_out: booking.check_out,
      nights: booking.nights,
      total_revenue: booking.total_revenue,
      nightly_rate: booking.nightly_rate,
      status: 'active',
      updated_at: new Date().toISOString(),
    }

    if (existing) {
      const { error: updateErr } = await supabase
        .from('bookings')
        .update(record)
        .eq('id', existing.id)
      if (updateErr) dbErrors.push(`Update ${booking.external_booking_id}: ${updateErr.message}`)
      else updatedBookings++
    } else {
      const { error: insertErr } = await supabase
        .from('bookings')
        .insert({ ...record, created_at: new Date().toISOString() })
      if (insertErr) dbErrors.push(`Insert ${booking.external_booking_id}: ${insertErr.message}`)
      else newBookings++
    }
  }

  // If every single booking failed to save, return an error with the first message
  if (dbErrors.length > 0 && newBookings === 0 && updatedBookings === 0) {
    return NextResponse.json(
      { error: `All bookings failed to save. First error: ${dbErrors[0]}` },
      { status: 500 }
    )
  }

  // ── Log the import ──────────────────────────
  await supabase.from('csv_imports').insert({
    property_id: propertyId,
    platform,
    imported_at: new Date().toISOString(),
    rows_imported: rows.length,
    new_bookings: newBookings,
    updated_bookings: updatedBookings,
    cancelled_bookings: cancelledBookings,
    created_at: new Date().toISOString(),
  })

  const result = {
    newBookings,
    updatedBookings,
    cancelledBookings,
    propertyName: property.name,
    platform: platform.charAt(0).toUpperCase() + platform.slice(1),
    dbErrors: dbErrors.length > 0 ? dbErrors : undefined,
  }

  return NextResponse.json(result)
}
