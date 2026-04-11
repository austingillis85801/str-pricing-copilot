import { createServerSupabaseClient } from './supabase-server'

// ─── Coordinates ──────────────────────────────────────────────────────────────

export const PROPERTY_COORDS: Record<string, { lat: number; lng: number; label: string; airbnbSearchUrl: string }> = {
  moab: {
    lat: 38.5733,
    lng: -109.5498,
    label: 'Moab, UT',
    airbnbSearchUrl: 'https://www.airbnb.com/s/Moab--UT--United-States/homes?adults=2&place_id=ChIJV2lfFqGZUIcR6e7cqvpJSFw&refinement_paths%5B%5D=%2Fhomes&room_types%5B%5D=Entire+home%2Fapt',
  },
  'bear-lake': {
    lat: 41.9377,
    lng: -111.343,
    label: 'Bear Lake, UT',
    airbnbSearchUrl: 'https://www.airbnb.com/s/Garden-City--UT--United-States/homes?adults=2&refinement_paths%5B%5D=%2Fhomes&room_types%5B%5D=Entire+home%2Fapt',
  },
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CompetitorListing {
  listing_id: string
  name: string
  price_per_night: number
  rating: number | null
  bedrooms: number | null
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

/** Start an Apify actor run. Returns the run ID instantly. */
export async function startApifyRun(
  airbnbSearchUrl: string,
  maxListings = 20
): Promise<string> {
  const token = process.env.APIFY_TOKEN
  if (!token) throw new Error('APIFY_TOKEN not set')

  const res = await fetch(
    `https://api.apify.com/v2/acts/${APIFY_ACTOR}/runs?token=${token}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        startUrls: [{ url: airbnbSearchUrl }],
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

/** Fetch results from a completed Apify run's dataset. */
export async function fetchApifyResults(
  datasetId: string,
  maxListings = 20
): Promise<CompetitorListing[]> {
  const token = process.env.APIFY_TOKEN
  if (!token) throw new Error('APIFY_TOKEN not set')

  const res = await fetch(
    `https://api.apify.com/v2/datasets/${datasetId}/items?token=${token}&limit=${maxListings}`,
    { signal: AbortSignal.timeout(15_000) }
  )

  if (!res.ok) {
    throw new Error(`Apify dataset fetch failed ${res.status}`)
  }

  const items = await res.json() as Record<string, unknown>[]

  if (items.length > 0) {
    console.log('Apify sample item keys:', Object.keys(items[0]))
    // Log price structure to help debug
    const first = items[0]
    const priceObj = first.price as Record<string, unknown> | undefined
    console.log('Apify price sample:', JSON.stringify(priceObj).slice(0, 300))
    console.log('Apify extracted price:', extractPrice(first))
  } else {
    console.warn('Apify returned 0 items')
  }

  return items
    .filter((item) => {
      // Only keep entire-home listings (houses, condos, cabins, townhouses).
      // Exclude campsites, tents, yurts, hotel rooms, shared spaces, etc.
      const pt = typeof item.propertyType === 'string' ? item.propertyType : ''
      const rt = typeof item.roomType === 'string' ? item.roomType : ''
      // Must be an "Entire X" property type OR roomType "Entire home/apt"
      const isEntireProperty = pt.startsWith('Entire') || rt === 'Entire home/apt'
      // Double-check: exclude known non-house property types even if they slipped through
      const isExcluded = /camp|tent|yurt|dome|rv|camper|hostel|hotel|resort|shared|farm stay/i.test(pt)
      return isEntireProperty && !isExcluded
    })
    .map((item) => ({
      listing_id: String(item.id ?? item.listingId ?? item.listing_id ?? ''),
      name: String(item.title ?? item.name ?? ''),
      price_per_night: extractPrice(item),
      rating: extractRating(item),
      bedrooms: extractBedrooms(item),
      distance_miles: null,
      platform: 'airbnb' as const,
      url: item.url ? String(item.url) : null,
    }))
    .filter((item) => item.price_per_night > 0)
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

async function fetchAirROIMarket(
  lat: number,
  lng: number
): Promise<{ adr: number | null; occupancy_rate: number | null }> {
  const apiKey = process.env.AIRROI_API_KEY
  if (!apiKey) return { adr: null, occupancy_rate: null }

  try {
    const res = await fetch(
      `https://api.airroi.com/v1/market/data?lat=${lat}&lng=${lng}&radius=10`,
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(15_000),
      }
    )
    if (!res.ok) return { adr: null, occupancy_rate: null }

    const data = await res.json() as Record<string, unknown>
    return {
      adr: data.avg_daily_rate != null ? Number(data.avg_daily_rate) : null,
      occupancy_rate: data.occupancy_rate != null ? Number(data.occupancy_rate) : null,
    }
  } catch {
    return { adr: null, occupancy_rate: null }
  }
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

    const competitors = data.competitors as CompetitorListing[]
    if (!competitors || competitors.length === 0) return null

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
  const airroi = await fetchAirROIMarket(coords.lat, coords.lng)

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
