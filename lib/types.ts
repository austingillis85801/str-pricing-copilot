export type Platform = 'airbnb' | 'vrbo' | 'both'

export type BookingStatus = 'active' | 'cancelled'

export interface Property {
  id: string
  name: string
  location: string
  platform: Platform
  base_price: number
  min_price: number
  max_price: number
  amenities: string[]
  arches_timed_entry_active: boolean
  notes: string
  created_at: string
  updated_at: string
}

export interface Booking {
  id: string
  property_id: string
  external_booking_id: string
  platform: 'airbnb' | 'vrbo'
  check_in: string
  check_out: string
  nights: number
  total_revenue: number
  nightly_rate: number | null
  lead_time: number | null
  status: BookingStatus
  created_at: string
  updated_at: string
}

export interface CsvImport {
  id: string
  property_id: string
  platform: 'airbnb' | 'vrbo'
  imported_at: string
  rows_imported: number
  new_bookings: number
  updated_bookings: number
  cancelled_bookings: number
  created_at: string
}

export interface ImportResult {
  newBookings: number
  updatedBookings: number
  cancelledBookings: number
  propertyName: string
  platform: string
}

export interface PropertyFormData {
  id?: string
  name: string
  location: string
  platform: Platform
  base_price: number
  min_price: number
  max_price: number
  amenities: string[]
  arches_timed_entry_active: boolean
  notes: string
}

export const AMENITIES = [
  'Hot tub',
  'Pool',
  'Lake access',
  'Pet-friendly',
  'Dedicated workspace',
  'Fire pit',
  'Mountain views',
] as const

export const PROPERTY_SLUGS = {
  moab: 'moab',
  bearLake: 'bear-lake',
} as const
