import { createServerSupabaseClient } from './supabase-server'

// ─── Coordinates ──────────────────────────────────────────────────────────────

export const PROPERTY_COORDS: Record<string, {
  lat: number
  lng: number
  label: string
  bedrooms: number
  baths: number
  guests: number
  maxMiles: number
  airbnbSearchUrl: string
}> = {
  moab: {
    // 3853 S Red Valley Cir, Moab UT — Rim Village Vistas subdivision
    lat: 38.5153,
    lng: -109.4892,
    label: 'Moab, UT',
    bedrooms: 2,
    baths: 2,
    guests: 4,
    maxMiles: 5,
    // ±1 bedroom: min 1, max 3
    airbnbSearchUrl: 'https://www.airbnb.com/s/Moab--UT--United-States/homes?adults=2&place_id=ChIJV2lfFqGZUIcR6e7cqvpJSFw&refinement_paths%5B%5D=%2Fhomes&room_types%5B%5D=Entire+home%2Fapt&min_bedrooms=1&max_bedrooms=3',
  },
  'bear-lake': {
    // 235 Seasons Ln, Garden City UT
    lat: 41.9481,
    lng: -111.3986,
    label: 'Bear Lake, UT',
    bedrooms: 4,
    baths: 3,
    guests: 8,
    maxMiles: 5,
    // ±1 bedroom: min 3, max 5
    airbnbSearchUrl: 'https://www.airbnb.com/s/Garden-City--UT--United-States/homes?adults=2&refinement_paths%5B%5D=%2Fhomes&room_types%5B%5D=Entire+home%2Fapt&min_bedrooms=3&max_bedrooms=5',
  },
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CompetitorListing {
  listing_id: string
  name: string
  price_per_night: number
  rating: number | null
  bedrooms: number | null
  property_type: string | null
  distance_miles: number | null
  platform: 'airbnb' | 'airroi'
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

export interface CompetitorData {
  property_id: string
  slug: string
  competitors: CompetitorListing[]
  market: MarketSnapshot
}

// Cache TTL: 4 days in ms (matches cron schedule)
const CACHE_TTL_MS = 4 * 24 * 60 * 60 * 1000

// ─── Apify — Async run pattern ───────────────────────────────────────────────
// Instead of the sync endpoint (which takes 1-3 min and times out on Vercel
// Hobby's 60s limit), we use the async pattern:
//   1. startApifyRun() → kicks off actor, returns runId instantly (<2s)
//   2. checkApifyRun() → polls run status (<1s per call)
//   3. fetchApifyResults() → fetches dataset items when run is SUCCEEDED (<2s)

// tri_angle~airbnb-scraper — maintained by Apify, returns full listing details
const APIFY_ACTOR = 'tri_angle~airbnb-scraper'

/** Build an Airbnb search URL with next Monday→Sunday dates for consistent weekly pricing. */
function addWeeklyDates(baseUrl: string): string {
  const today = new Date()
  // Days until next Monday (1=Mon ... 0=Sun treated as 7)
  const dayOfWeek = today.getDay() === 0 ? 7 : today.getDay()
  const daysUntilMonday = dayOfWeek === 1 ? 7 : 8 - dayOfWeek
  const checkIn = new Date(today)
  checkIn.setDate(today.getDate() + daysUntilMonday)
  const checkOut = new Date(checkIn)
  checkOut.setDate(checkIn.getDate() + 7)
  const fmt = (d: Date) => d.toISOString().split('T')[0]
  const sep = baseUrl.includes('?') ? '&' : '?'
  return `${baseUrl}${sep}check_in=${fmt(checkIn)}&check_out=${fmt(checkOut)}`
}

/** Start an Apify actor run. Returns the run ID instantly. */
export async function startApifyRun(
  airbnbSearchUrl: string,
  maxListings = 40
): Promise<string> {
  const token = process.env.APIFY_TOKEN
  if (!token) throw new Error('APIFY_TOKEN not set')

  // Always request next Monday→Sunday to get a full week (weekday + weekend pricing)
  // This makes market snapshots comparable run-to-run regardless of when cron fires
  const datedUrl = addWeeklyDates(airbnbSearchUrl)

  const res = await fetch(
    `https://api.apify.com/v2/acts/${APIFY_ACTOR}/runs?token=${token}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        startUrls: [{ url: datedUrl }],
        maxListings,
        currency: 'USD',
        includeReviews: false,
        calendarMonths: 0,
      }),
      signal: AbortSignal.timeout(15_000),
    }
  )

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Apify start failed ${res.status}: ${body.slice(0, 300)}`)
  }

  const json = await res.json() as { data?: { id?: string } }
  const runId = json.data?.id
  if (!runId) throw new Error('Apify did not return a run ID')
  return runId
}

/** Check the status of an Apify run. Returns status string. */
export async function checkApifyRun(runId: string): Promise<{
  status: 'READY' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'ABORTED' | 'TIMED-OUT'
  datasetId: string | null
}> {
  const token = process.env.APIFY_TOKEN
  if (!token) throw new Error('APIFY_TOKEN not set')

  const res = await fetch(
    `https://api.apify.com/v2/actor-runs/${runId}?token=${token}`,
    { signal: AbortSignal.timeout(10_000) }
  )

  if (!res.ok) {
    throw new Error(`Apify status check failed ${res.status}`)
  }

  const json = await res.json() as {
    data?: { status?: string; defaultDatasetId?: string }
  }

  return {
    status: (json.data?.status ?? 'RUNNING') as 'READY' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'ABORTED' | 'TIMED-OUT',
    datasetId: json.data?.defaultDatasetId ?? null,
  }
}

/** Haversine distance between two lat/lng points, in miles. */
function haversineDistanceMiles(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 3958.8 // Earth radius in miles
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2)
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export interface FetchApifyOpts {
  /** Lat of the owner's property — used to calculate distance and filter by radius. */
  propertyLat?: number
  /** Lng of the owner's property. */
  propertyLng?: number
  /** Bedroom count of the owner's property — competitors filtered to ±1 bedroom. */
  propertyBedrooms?: number
  /** Maximum distance from the property in miles (default: 5). */
  maxMiles?: number
}

/** Fetch results from a completed Apify run's dataset. */
export async function fetchApifyResults(
  datasetId: string,
  maxListings = 20,
  opts: FetchApifyOpts = {}
): Promise<CompetitorListing[]> {
  const token = process.env.APIFY_TOKEN
  if (!token) throw new Error('APIFY_TOKEN not set')

  // Fetch more raw items than we need so we still have good coverage after filtering
  const fetchLimit = Math.max(maxListings * 3, 60)

  const res = await fetch(
    `https://api.apify.com/v2/datasets/${datasetId}/items?token=${token}&limit=${fetchLimit}`,
    { signal: AbortSignal.timeout(15_000) }
  )

  if (!res.ok) {
    throw new Error(`Apify dataset fetch failed ${res.status}`)
  }

  const items = await res.json() as Record<string, unknown>[]

  if (items.length > 0) {
    console.log('Apify sample item keys:', Object.keys(items[0]))
    const first = items[0]
    const priceObj = first.price as Record<string, unknown> | undefined
    console.log('Apify price sample:', JSON.stringify(priceObj).slice(0, 300))
    console.log('Apify extracted price:', extractPrice(first))
  } else {
    console.warn('Apify returned 0 items')
  }

  const {
    propertyLat,
    propertyLng,
    propertyBedrooms,
    maxMiles = 5,
  } = opts

  const hasCoords = propertyLat != null && propertyLng != null

  return items
    .filter((item) => {
      // ── Property type filter ─────────────────────────────────────────────────
      // Only entire-home listings (houses, condos, cabins, townhouses).
      const pt = typeof item.propertyType === 'string' ? item.propertyType : ''
      const rt = typeof item.roomType === 'string' ? item.roomType : ''
      const isEntireProperty = pt.startsWith('Entire') || rt === 'Entire home/apt'
      const isExcluded = /camp|tent|yurt|dome|rv|camper|hostel|hotel|resort|shared|farm stay/i.test(pt)
      if (!isEntireProperty || isExcluded) return false

      // ── Distance filter ──────────────────────────────────────────────────────
      if (hasCoords) {
        const coords = item.coordinates as { latitude?: number; longitude?: number } | undefined
        if (coords?.latitude != null && coords?.longitude != null) {
          const dist = haversineDistanceMiles(propertyLat!, propertyLng!, coords.latitude, coords.longitude)
          if (dist > maxMiles) {
            console.log(`Filtered out "${item.title}" — ${dist.toFixed(1)} mi away (limit ${maxMiles} mi)`)
            return false
          }
        }
      }

      // ── Bedroom filter ───────────────────────────────────────────────────────
      // Only filter when we can extract the bedroom count AND a target is given.
      if (propertyBedrooms != null) {
        const listingBedrooms = extractBedrooms(item)
        if (listingBedrooms != null) {
          const minBr = Math.max(0, propertyBedrooms - 1)
          const maxBr = propertyBedrooms + 1
          if (listingBedrooms < minBr || listingBedrooms > maxBr) {
            console.log(`Filtered out "${item.title}" — ${listingBedrooms} br (target ${propertyBedrooms} ±1)`)
            return false
          }
        }
      }

      return true
    })
    .map((item) => {
      // Calculate distance for display
      let distanceMiles: number | null = null
      if (hasCoords) {
        const coords = item.coordinates as { latitude?: number; longitude?: number } | undefined
        if (coords?.latitude != null && coords?.longitude != null) {
          distanceMiles = Math.round(haversineDistanceMiles(propertyLat!, propertyLng!, coords.latitude, coords.longitude) * 10) / 10
        }
      }

      return {
        listing_id: String(item.id ?? item.listingId ?? item.listing_id ?? ''),
        name: String(item.title ?? item.name ?? ''),
        price_per_night: extractPrice(item),
        rating: extractRating(item),
        bedrooms: extractBedrooms(item),
        property_type: typeof item.propertyType === 'string' ? item.propertyType : null,
        distance_miles: distanceMiles,
        platform: 'airbnb' as const,
        url: item.url ? String(item.url) : null,
      }
    })
    .filter((item) => item.price_per_night > 0)
    .sort((a, b) => (a.distance_miles ?? 99) - (b.distance_miles ?? 99)) // nearest first
    .slice(0, maxListings)
}

/**
 * Extract per-night price from a tri_angle~airbnb-scraper item.
 *
 * The actor returns price as a nested object. Nightly price is stored in:
 *   price.breakDown.basePrice.description = "5 nights x $111.23"
 * or if qualifier === "night":
 *   price.price = "$107"
 */
function extractPrice(item: Record<string, unknown>): number {
  const priceObj = item.price as Record<string, unknown> | undefined

  if (priceObj) {
    // Primary: parse per-night rate from breakdown description "N nights x $XXX.XX"
    const breakDown = priceObj.breakDown as Record<string, unknown> | undefined
    const basePrice = breakDown?.basePrice as Record<string, unknown> | undefined
    const description = typeof basePrice?.description === 'string' ? basePrice.description : ''
    if (description) {
      // "5 nights x $111.23"  or  "1 night x $200"
      const m = description.match(/x\s*\$([0-9,]+(?:\.[0-9]+)?)/)
      if (m) {
        const v = parseFloat(m[1].replace(',', ''))
        if (!isNaN(v) && v > 0) return v
      }
    }

    // Secondary: if qualifier is "night", price.price is already per-night
    if (priceObj.qualifier === 'night') {
      for (const key of ['price', 'amount', 'originalPrice', 'discountedPrice']) {
        const raw = priceObj[key]
        if (typeof raw === 'string') {
          const v = parseFloat(raw.replace(/[^0-9.]/g, ''))
          if (!isNaN(v) && v > 0) return v
        }
        if (typeof raw === 'number' && raw > 0) return raw
      }
    }

    // Tertiary: try price.label "e.g. $107 per night"
    if (typeof priceObj.label === 'string' && priceObj.label.includes('per night')) {
      const m = priceObj.label.match(/\$([0-9,]+(?:\.[0-9]+)?)/)
      if (m) {
        const v = parseFloat(m[1].replace(',', ''))
        if (!isNaN(v) && v > 0) return v
      }
    }
  }

  // Legacy fallbacks for other actor formats
  for (const key of ['pricePerNight', 'basePrice', 'rate']) {
    const val = item[key]
    if (typeof val === 'number' && val > 0) return val
  }

  return 0
}

/**
 * Extract overall guest rating.
 * tri_angle actor: rating is an object with guestSatisfaction field.
 */
function extractRating(item: Record<string, unknown>): number | null {
  const r = item.rating as Record<string, unknown> | undefined
  if (r != null) {
    if (typeof r.guestSatisfaction === 'number') return r.guestSatisfaction
    if (typeof r === 'number') return r as unknown as number
  }
  if (typeof item.stars === 'number') return item.stars
  return null
}

/**
 * Extract bedroom count.
 * tri_angle actor: subDescription.items = ["8 guests", "3 bedrooms", "4 beds", "2.5 baths"]
 */
function extractBedrooms(item: Record<string, unknown>): number | null {
  // Direct field first
  if (typeof item.bedrooms === 'number') return item.bedrooms

  // Parse from subDescription.items
  const sub = item.subDescription as { items?: unknown[] } | undefined
  if (Array.isArray(sub?.items)) {
    const bedroomStr = sub.items.find(
      (s): s is string => typeof s === 'string' && s.includes('bedroom')
    )
    if (bedroomStr) {
      const m = bedroomStr.match(/(\d+)/)
      if (m) return parseInt(m[1])
    }
    // "Studio" → treat as 0 bedrooms (small unit)
    if (sub.items.some((s): s is string => typeof s === 'string' && s.toLowerCase() === 'studio')) {
      return 0
    }
  }

  return null
}

// ─── AirROI — Market-level ADR + occupancy ────────────────────────────────────
//
// Two-step flow (per AirROI API docs at airroi.com/api/documentation):
//   1. GET /markets/search?latitude=&longitude= → returns { country, region, locality, district }
//   2. POST /markets/summary with { market:{...}, filter:{bedrooms:{range:[min,max]}}, num_months:12 }
// Auth: X-API-KEY header only.

const AIRROI_BASE = 'https://api.airroi.com'

export async function fetchAirROIMarket(
  lat: number,
  lng: number,
  bedrooms?: number
): Promise<{ adr: number | null; occupancy_rate: number | null }> {
  const apiKey = process.env.AIRROI_API_KEY
  if (!apiKey) {
    console.log('AirROI: AIRROI_API_KEY not set, skipping')
    return { adr: null, occupancy_rate: null }
  }

  const headers = {
    'X-API-KEY': apiKey,
    'Content-Type': 'application/json',
  }

  try {
    // ── Step 1: Look up the market at these coordinates ─────────────────────
    // /markets/lookup?lat=&lng= returns {country, region, locality, district} — confirmed working.
    const lookupRes = await fetch(
      `${AIRROI_BASE}/markets/lookup?lat=${lat}&lng=${lng}`,
      { headers, signal: AbortSignal.timeout(15_000) }
    )

    if (!lookupRes.ok) {
      const body = await lookupRes.text().catch(() => '')
      console.warn(`AirROI /markets/lookup error ${lookupRes.status}: ${body}`)
      return { adr: null, occupancy_rate: null }
    }

    const lookupData = await lookupRes.json() as Record<string, unknown>
    console.log('AirROI market lookup raw:', JSON.stringify(lookupData).slice(0, 400))

    // Unwrap .data wrapper if present
    const mkt = (lookupData.data ?? lookupData) as Record<string, unknown>
    const { country, region, locality, district } = mkt as {
      country?: string; region?: string; locality?: string; district?: string | null
    }

    if (!country || !region || !locality) {
      console.warn('AirROI: missing market fields', JSON.stringify(lookupData).slice(0, 200))
      return { adr: null, occupancy_rate: null }
    }

    console.log(`AirROI market: ${locality}, ${region}, ${country}`)

    // ── Step 2: Get market summary (ADR + occupancy) ─────────────────────────
    // Include bedroom filter to match our property type (±1 bedroom)
    const bedroomFilter = bedrooms != null
      ? { bedrooms: { range: [Math.max(0, bedrooms - 1), bedrooms + 1] } }
      : {}

    const summaryRes = await fetch(
      `${AIRROI_BASE}/markets/summary`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          market: { country, region, locality, district: district ?? null },
          filter: {
            ...bedroomFilter,
            room_type: { eq: 'entire_home' },
          },
          num_months: 12,
          currency: 'usd',
        }),
        signal: AbortSignal.timeout(15_000),
      }
    )

    if (!summaryRes.ok) {
      const body = await summaryRes.text().catch(() => '')
      console.warn(`AirROI /markets/summary error ${summaryRes.status}: ${body}`)
      return { adr: null, occupancy_rate: null }
    }

    const summaryData = await summaryRes.json() as Record<string, unknown>
    console.log('AirROI summary raw:', JSON.stringify(summaryData).slice(0, 600))

    // Unwrap .data wrapper if present
    const s = (summaryData.data ?? summaryData) as Record<string, unknown>

    // Confirmed field names from live AirROI /markets/summary response:
    // { occupancy: 0.49, average_daily_rate: 299.5, rev_par: 151.7, ... }
    const adr = s.average_daily_rate != null ? Number(s.average_daily_rate) : null
    const occupancy_rate = s.occupancy != null ? Number(s.occupancy) : null

    console.log(`AirROI parsed — ADR: ${adr}, occupancy: ${occupancy_rate}`)
    return { adr, occupancy_rate }
  } catch (err) {
    console.warn('AirROI fetch failed (non-fatal):', err instanceof Error ? err.message : String(err))
    return { adr: null, occupancy_rate: null }
  }
}

// ─── AirROI — Comparable listings ────────────────────────────────────────────
//
// GET /listings/comparables?latitude=&longitude=&bedrooms=&baths=&guests=
// Returns individual comparable properties near our property with pricing data.
// Can supplement or replace Apify when Apify hits spending limits.

export async function fetchAirROIComparables(
  lat: number,
  lng: number,
  bedrooms: number,
  baths: number,
  guests: number
): Promise<CompetitorListing[]> {
  const apiKey = process.env.AIRROI_API_KEY
  if (!apiKey) {
    console.log('AirROI comparables: AIRROI_API_KEY not set, skipping')
    return []
  }

  try {
    const url = `${AIRROI_BASE}/listings/comparables?latitude=${lat}&longitude=${lng}&bedrooms=${bedrooms}&baths=${baths}&guests=${guests}&currency=usd`
    const res = await fetch(url, {
      headers: { 'X-API-KEY': apiKey, 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(15_000),
    })

    if (!res.ok) {
      const body = await res.text().catch(() => '')
      console.warn(`AirROI /listings/comparables error ${res.status}: ${body}`)
      return []
    }

    const data = await res.json() as Record<string, unknown>
    console.log('AirROI comparables raw keys:', Object.keys(data))

    // Response may be { listings: [...] } or { data: { listings: [...] } } or an array directly
    const raw = data.listings ?? (data.data as Record<string, unknown>)?.listings ?? data
    const items: Record<string, unknown>[] = Array.isArray(raw) ? raw : []

    if (items.length > 0) {
      console.log('AirROI comparables first item keys:', Object.keys(items[0]))
    } else {
      console.warn('AirROI comparables returned 0 items')
      return []
    }

    return items
      .map((item): CompetitorListing | null => {
        // listing_info, location_info, property_details, pricing_info, ratings
        const listingInfo = item.listing_info as Record<string, unknown> | undefined
        const locationInfo = item.location_info as Record<string, unknown> | undefined
        const propertyDetails = item.property_details as Record<string, unknown> | undefined
        const pricingInfo = item.pricing_info as Record<string, unknown> | undefined
        const ratings = item.ratings as Record<string, unknown> | undefined

        const id = String(item.id ?? item.listing_id ?? '')
        const name = String(listingInfo?.name ?? item.name ?? item.title ?? '')

        // Extract nightly rate from pricing_info
        const nightlyRate =
          typeof pricingInfo?.nightly_rate === 'number' ? pricingInfo.nightly_rate :
          typeof pricingInfo?.rate === 'number' ? pricingInfo.rate :
          typeof pricingInfo?.price === 'number' ? pricingInfo.price :
          typeof item.nightly_rate === 'number' ? item.nightly_rate :
          0

        if (nightlyRate <= 0) return null

        // Distance from our property
        const itemLat = typeof locationInfo?.latitude === 'number' ? locationInfo.latitude : null
        const itemLng = typeof locationInfo?.longitude === 'number' ? locationInfo.longitude : null
        const distanceMiles = itemLat != null && itemLng != null
          ? Math.round(haversineDistanceMiles(lat, lng, itemLat, itemLng) * 10) / 10
          : null

        const rating =
          typeof ratings?.overall === 'number' ? ratings.overall :
          typeof item.rating === 'number' ? item.rating :
          null

        const listingBedrooms =
          typeof propertyDetails?.bedrooms === 'number' ? propertyDetails.bedrooms :
          typeof item.bedrooms === 'number' ? item.bedrooms :
          null

        const propertyType = String(
          propertyDetails?.property_type ?? listingInfo?.room_type ?? item.property_type ?? ''
        ) || null

        const itemUrl = String(listingInfo?.url ?? item.url ?? '') || null

        return {
          listing_id: id,
          name,
          price_per_night: nightlyRate,
          rating,
          bedrooms: listingBedrooms,
          property_type: propertyType,
          distance_miles: distanceMiles,
          platform: 'airroi',
          url: itemUrl,
        }
      })
      .filter((l): l is CompetitorListing => l !== null)
      .sort((a, b) => (a.distance_miles ?? 99) - (b.distance_miles ?? 99))
  } catch (err) {
    console.warn('AirROI comparables fetch failed (non-fatal):', err instanceof Error ? err.message : String(err))
    return []
  }
}

// ─── Merge competitor listings from multiple sources ─────────────────────────
// Deduplicates by listing_id — Apify takes priority over AirROI for same ID.

export function mergeCompetitorListings(
  primary: CompetitorListing[],   // higher priority (Apify)
  secondary: CompetitorListing[]  // fills gaps (AirROI)
): CompetitorListing[] {
  const seen = new Set(primary.map((l) => l.listing_id).filter(Boolean))
  const extras = secondary.filter((l) => !l.listing_id || !seen.has(l.listing_id))
  return [...primary, ...extras].sort((a, b) => (a.distance_miles ?? 99) - (b.distance_miles ?? 99))
}

// ─── Market stats from listing prices ────────────────────────────────────────

export function buildMarketSnapshot(
  listings: CompetitorListing[],
  airroi: { adr: number | null; occupancy_rate: number | null } = { adr: null, occupancy_rate: null }
): MarketSnapshot {
  const prices = listings.map((l) => l.price_per_night).sort((a, b) => a - b)

  function percentile(arr: number[], p: number): number {
    if (arr.length === 0) return 0
    const idx = Math.floor((p / 100) * arr.length)
    return arr[Math.min(idx, arr.length - 1)]
  }

  const avg =
    prices.length > 0
      ? Math.round(prices.reduce((s, p) => s + p, 0) / prices.length)
      : 0
  const median = percentile(prices, 50)

  return {
    avg_price: avg,
    median_price: median,
    percentile_25: percentile(prices, 25),
    percentile_75: percentile(prices, 75),
    sample_size: listings.length,
    market_occupancy_rate: airroi.occupancy_rate,
    market_adr: airroi.adr,
    airroi_cached: airroi.adr !== null,
    cached_at: new Date().toISOString(),
  }
}

// ─── Supabase cache ───────────────────────────────────────────────────────────

export async function readCache(propertyId: string): Promise<CompetitorData | null> {
  try {
    const supabase = createServerSupabaseClient()
    const { data, error } = await supabase
      .from('market_data')
      .select('*')
      .eq('property_id', propertyId)
      .order('fetched_at', { ascending: false })
      .limit(1)
      .single()

    if (error || !data) return null

    const age = Date.now() - new Date(data.fetched_at as string).getTime()
    if (age > CACHE_TTL_MS) return null // stale

    const competitors = (data.competitors as CompetitorListing[]) ?? []

    return {
      property_id: propertyId,
      slug: data.slug as string,
      competitors,
      market: data.market_snapshot as MarketSnapshot,
    }
  } catch {
    return null
  }
}

export async function writeCache(
  propertyId: string,
  slug: string,
  competitors: CompetitorListing[],
  market: MarketSnapshot
): Promise<void> {
  try {
    const supabase = createServerSupabaseClient()
    await supabase.from('market_data').insert({
      property_id: propertyId,
      slug,
      competitors,
      market_snapshot: market,
      fetched_at: new Date().toISOString(),
    })
  } catch {
    console.warn('Could not write to market_data table')
  }
}

// ─── Main export (cache-only for fast reads) ─────────────────────────────────

export async function getMarketSnapshot(
  propertyId: string,
  slug: 'moab' | 'bear-lake',
  forceRefresh = false
): Promise<CompetitorData> {
  // Check cache first
  if (!forceRefresh) {
    const cached = await readCache(propertyId)
    if (cached) return cached
  }

  const coords = PROPERTY_COORDS[slug]
  if (!coords) throw new Error(`Unknown property slug: ${slug}`)

  // Fetch AirROI (fast, non-fatal) — Apify is now handled via async start/poll
  const airroi = await fetchAirROIMarket(coords.lat, coords.lng, coords.bedrooms)

  // Return empty market snapshot if no cache — caller should use async flow
  return {
    property_id: propertyId,
    slug,
    competitors: [],
    market: buildMarketSnapshot([], airroi),
  }
}

// ─── Competitor adjustment signal ─────────────────────────────────────────────

export function getCompetitorAdjustment(
  yourPrice: number,
  market: MarketSnapshot,
  daysUntil: number
): { adjustment: 'raise' | 'hold' | 'cut' | null; reason: string } {
  if (market.sample_size < 3) return { adjustment: null, reason: 'Too few comparable listings' }

  const pctAboveMarket = ((yourPrice - market.avg_price) / market.avg_price) * 100
  const pctBelowMarket = -pctAboveMarket

  if (daysUntil <= 7 && pctAboveMarket > 10) {
    return {
      adjustment: 'cut',
      reason: `You're ${Math.round(pctAboveMarket)}% above market avg with only ${daysUntil} days left — cut to near market rate`,
    }
  }

  if (daysUntil <= 21 && pctAboveMarket > 20) {
    return {
      adjustment: 'cut',
      reason: `${Math.round(pctAboveMarket)}% above market avg with ${daysUntil} days remaining`,
    }
  }

  if (daysUntil > 21 && pctBelowMarket > 10) {
    return {
      adjustment: 'raise',
      reason: `You're ${Math.round(pctBelowMarket)}% below market avg — room to raise price`,
    }
  }

  if (Math.abs(pctAboveMarket) <= 10) {
    return { adjustment: 'hold', reason: 'Within 10% of market average — healthy position' }
  }

  return { adjustment: null, reason: '' }
}
