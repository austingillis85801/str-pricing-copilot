import { createServerSupabaseClient } from './supabase-server'

// ─── Coordinates ──────────────────────────────────────────────────────────────

export const PROPERTY_COORDS: Record<string, { lat: number; lng: number; label: string }> = {
  moab: { lat: 38.5733, lng: -109.5498, label: 'Moab, UT' },
  'bear-lake': { lat: 41.9377, lng: -111.343, label: 'Bear Lake, UT' },
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
  // AirROI market-level signals (null if fetch failed)
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

// Cache TTL: 24 hours in ms
const CACHE_TTL_MS = 24 * 60 * 60 * 1000

// ─── Apify — Live Airbnb competitor listings ──────────────────────────────────

async function fetchApifyCompetitors(
  lat: number,
  lng: number,
  radiusMiles = 10,
  maxListings = 40
): Promise<CompetitorListing[]> {
  const token = process.env.APIFY_TOKEN
  if (!token) throw new Error('APIFY_TOKEN not set')

  // Apify Airbnb Scraper actor: dtrungtin/airbnb-scraper
  // We search by coordinates using a location string. Apify builds the search URL.
  const locationQuery = `${lat},${lng}`

  const runRes = await fetch(
    'https://api.apify.com/v2/acts/dtrungtin~airbnb-scraper/run-sync-get-dataset-items?token=' + token,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        startUrls: [],
        locationQuery,
        maxListings,
        currency: 'USD',
        includeReviews: false,
        calendarMonths: 0,
      }),
      signal: AbortSignal.timeout(55_000), // 55s max (route has 60s budget)
    }
  )

  if (!runRes.ok) {
    const body = await runRes.text()
    throw new Error(`Apify run failed ${runRes.status}: ${body.slice(0, 200)}`)
  }

  const items = await runRes.json() as Record<string, unknown>[]

  // Normalize Apify response to our type
  return items
    .filter((item) => typeof item.price === 'number' && item.price > 0)
    .map((item) => ({
      listing_id: String(item.id ?? item.listingId ?? ''),
      name: String(item.name ?? item.title ?? ''),
      price_per_night: Number(item.price),
      rating: item.rating != null ? Number(item.rating) : null,
      bedrooms: item.bedrooms != null ? Number(item.bedrooms) : null,
      distance_miles: null, // Apify doesn't return distance — we store null
      platform: 'airbnb' as const,
      url: item.url ? String(item.url) : null,
    }))
    .slice(0, maxListings)
}

// ─── AirROI — Market-level ADR + occupancy ────────────────────────────────────

async function fetchAirROIMarket(
  lat: number,
  lng: number
): Promise<{ adr: number | null; occupancy_rate: number | null }> {
  const apiKey = process.env.AIRROI_API_KEY
  if (!apiKey) return { adr: null, occupancy_rate: null }

  try {
    // AirROI market data endpoint — coordinates-based lookup
    // Docs require signing in; endpoint confirmed as /api/v1/market/data
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
    // Non-fatal — AirROI enriches but isn't required
    return { adr: null, occupancy_rate: null }
  }
}

// ─── Market stats from listing prices ────────────────────────────────────────

function buildMarketSnapshot(
  listings: CompetitorListing[],
  airroi: { adr: number | null; occupancy_rate: number | null }
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

async function readCache(propertyId: string): Promise<CompetitorData | null> {
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

    return {
      property_id: propertyId,
      slug: data.slug as string,
      competitors: data.competitors as CompetitorListing[],
      market: data.market_snapshot as MarketSnapshot,
    }
  } catch {
    return null
  }
}

async function writeCache(
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
    // Non-fatal — table may not exist yet
    console.warn('Could not write to market_data table')
  }
}

// ─── Main export ──────────────────────────────────────────────────────────────

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

  // Fetch both sources in parallel (AirROI failure is non-fatal)
  const [listings, airroi] = await Promise.all([
    fetchApifyCompetitors(coords.lat, coords.lng),
    fetchAirROIMarket(coords.lat, coords.lng),
  ])

  const market = buildMarketSnapshot(listings, airroi)

  // Write to cache (best-effort)
  await writeCache(propertyId, slug, listings, market)

  return { property_id: propertyId, slug, competitors: listings, market }
}

// ─── Competitor adjustment signal ─────────────────────────────────────────────

/**
 * Given your recommended price and the market snapshot,
 * returns a signal: 'raise' | 'hold' | 'cut' | null
 * and a reason string.
 */
export function getCompetitorAdjustment(
  yourPrice: number,
  market: MarketSnapshot,
  daysUntil: number
): { adjustment: 'raise' | 'hold' | 'cut' | null; reason: string } {
  if (market.sample_size < 3) return { adjustment: null, reason: 'Too few comparable listings' }

  const pctAboveMarket = ((yourPrice - market.avg_price) / market.avg_price) * 100
  const pctBelowMarket = -pctAboveMarket

  // Within 7 days open AND you're the most expensive → cut urgently
  if (daysUntil <= 7 && pctAboveMarket > 10) {
    return {
      adjustment: 'cut',
      reason: `You're ${Math.round(pctAboveMarket)}% above market avg with only ${daysUntil} days left — cut to near market rate`,
    }
  }

  // Within 21 days AND significantly above market
  if (daysUntil <= 21 && pctAboveMarket > 20) {
    return {
      adjustment: 'cut',
      reason: `${Math.round(pctAboveMarket)}% above market avg with ${daysUntil} days remaining`,
    }
  }

  // Far out AND below market → raise opportunity
  if (daysUntil > 21 && pctBelowMarket > 10) {
    return {
      adjustment: 'raise',
      reason: `You're ${Math.round(pctBelowMarket)}% below market avg — room to raise price`,
    }
  }

  // Healthy range (within ±10% of market)
  if (Math.abs(pctAboveMarket) <= 10) {
    return { adjustment: 'hold', reason: 'Within 10% of market average — healthy position' }
  }

  return { adjustment: null, reason: '' }
}
