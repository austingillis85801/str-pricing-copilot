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
  dbErrors?: string[]
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

// ─── Phase 2 Types ────────────────────────────────────────────────────────────

export interface Event {
  id: string
  name: string
  event_date: string
  end_date?: string | null
  event_type: string
  property_id?: string | null
  location?: string | null
  is_active: boolean
  notes?: string | null
  created_at: string
}

export interface OpenDateAnalysis {
  date: string
  days_until_checkin: number
  is_behind_pace: boolean
  alert_level: 'watch' | 'action' | null
  suggested_discount: number
  base_price: number
  seasonal_multiplier: number
  recommended_price_low: number
  recommended_price_high: number
  event_name?: string
  is_weekend: boolean
}

export interface OrphanGap {
  start_date: string
  end_date: string
  nights: number
  suggested_discount: number
  suggested_min_stay: number
  adjacent_to_event: boolean
  preceding_booking_id: string
  following_booking_id: string
}

export interface UpcomingEvent {
  id: string
  name: string
  event_date: string
  end_date?: string | null
  event_type: string
  days_until: number
  multiplier: number
}

export type WeatherFlagType =
  | 'heat_friction'
  | 'flash_flood_risk'
  | 'snow_opportunity'
  | 'demand_boost'
  | 'demand_softness'
  | 'memorial_day_risk'

export interface WeatherFlag {
  property_id: string
  property_name: string
  type: WeatherFlagType
  message: string
  affected_dates?: string[]
  generated_at: string
}

export interface PricingAlert {
  date: string
  alert_level: 'watch' | 'action'
  reason: string
  suggested_discount: number
  recommended_price_low: number
  recommended_price_high: number
}

export interface SpecialWindow {
  name: string
  start_date: string
  end_date: string
  days_until_start: number
  recommended_action: string
  is_pricing_set: boolean
  property_applicable: boolean
}

export interface CalendarStatus {
  january_surge_flag: boolean
  summer_dates_priced: boolean
  peak_event_windows_priced: boolean
  flags: string[]
}

export interface RulesEngineOutput {
  property_id: string
  property_name: string
  generated_at: string
  occupancy_pct_this_month: number
  occupancy_pct_next_month: number
  avg_lead_time_days: number
  open_dates: OpenDateAnalysis[]
  orphan_gaps: OrphanGap[]
  upcoming_events: UpcomingEvent[]
  weather_flags: WeatherFlag[]
  pricing_alerts: PricingAlert[]
  special_windows: SpecialWindow[]
  calendar_status: CalendarStatus
}

// ─── Phase 3 Types ────────────────────────────────────────────────────────────

export interface AIRecommendation {
  priority: number
  action: string
  detail: string
  dates: string
  suggested_price?: number
  current_price?: number
  reason: string
  status?: 'pending' | 'applied' | 'dismissed'
}

export interface AIAnalysis {
  overall_assessment: string
  recommendations: AIRecommendation[]
}

export interface CalendarEntry {
  date: string
  recommended_price_low: number | null
  recommended_price_high: number | null
  alert_level: 'watch' | 'action' | null
  suggested_discount: number | null
  seasonal_multiplier: number | null
}

export interface CalendarBooking {
  id: string
  check_in: string
  check_out: string
  nights: number
  total_revenue: number
  nightly_rate: number | null
  status: string
}

export interface CalendarEvent {
  id: string
  name: string
  event_date: string
  end_date: string | null
  event_type: string
}

export interface CalendarData {
  bookings: CalendarBooking[]
  entries: CalendarEntry[]
  events: CalendarEvent[]
}

export interface BookingStats {
  this_month_revenue: number
  this_month_bookings: number
  last_year_revenue: number
  last_year_bookings: number
}

// ─── Phase 5 Types — Competitor Pricing ──────────────────────────────────────

export interface CompetitorListing {
  listing_id: string
  name: string
  price_per_night: number
  rating: number | null
  bedrooms: number | null
  property_type: string | null
  distance_miles: number | null
  platform: 'airbnb'
  url: string | null
}

export interface MarketSnapshot {
  avg_price: number
  median_price: number
  percentile_25: number
  percentile_75: number
  sample_size: number
  market_occupancy_rate: number | null
  market_adr: number | null
  airroi_cached: boolean
  cached_at: string
}

export interface CompetitorPricingData {
  property_id: string
  slug: string
  competitors: CompetitorListing[]
  market: MarketSnapshot
}
