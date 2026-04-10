import type { WeatherFlag } from './types'

// WMO weather code groups
const WMO_THUNDERSTORM = [95, 96, 97, 98, 99]
const WMO_SNOW = [71, 72, 73, 74, 75, 76, 77]

interface OpenMeteoDaily {
  time: string[]
  temperature_2m_max: number[]
  precipitation_sum: number[]
  weathercode: number[]
}

interface OpenMeteoResponse {
  daily: OpenMeteoDaily
}

async function fetchForecast(latitude: number, longitude: number): Promise<OpenMeteoResponse> {
  const url =
    `https://api.open-meteo.com/v1/forecast` +
    `?latitude=${latitude}&longitude=${longitude}` +
    `&daily=temperature_2m_max,precipitation_sum,weathercode` +
    `&forecast_days=14&timezone=America%2FDenver`

  const res = await fetch(url, { next: { revalidate: 3600 } })
  if (!res.ok) throw new Error(`Open-Meteo fetch failed: ${res.status} for ${latitude},${longitude}`)
  return res.json() as Promise<OpenMeteoResponse>
}

function celsiusToF(c: number): number {
  return (c * 9) / 5 + 32
}

export async function runWeatherEngine(): Promise<WeatherFlag[]> {
  const flags: WeatherFlag[] = []
  const now = new Date().toISOString()
  const today = new Date()

  // ─── Moab ────────────────────────────────────────────────────────────────────
  const moab = await fetchForecast(38.5733, -109.5498)

  // Heat friction: any of next 10 days avg_high > 98°F
  const moabHeatDates: string[] = []
  for (let i = 0; i < Math.min(10, moab.daily.time.length); i++) {
    if (celsiusToF(moab.daily.temperature_2m_max[i]) > 98) {
      moabHeatDates.push(moab.daily.time[i])
    }
  }
  if (moabHeatDates.length > 0) {
    flags.push({
      property_id: 'moab',
      property_name: 'Moab',
      type: 'heat_friction',
      message:
        'Forecast shows 98°F+ — summer dead zone pricing applies. Consider 1-night minimums.',
      affected_dates: moabHeatDates,
      generated_at: now,
    })
  }

  // Flash flood / storm risk — runs year-round (October is Moab's wettest month at 1.30")
  const moabStormDates: string[] = []
  for (let i = 0; i < moab.daily.time.length; i++) {
    if (
      WMO_THUNDERSTORM.includes(moab.daily.weathercode[i]) ||
      moab.daily.precipitation_sum[i] > 15
    ) {
      moabStormDates.push(moab.daily.time[i])
    }
  }
  if (moabStormDates.length > 0) {
    flags.push({
      property_id: 'moab',
      property_name: 'Moab',
      type: 'flash_flood_risk',
      message:
        'Storm risk flagged. Consider last-minute discount for open dates in this window.',
      affected_dates: moabStormDates,
      generated_at: now,
    })
  }

  // Snow opportunity: photography / winter tourism micro-spike
  const moabSnowDates: string[] = []
  for (let i = 0; i < moab.daily.time.length; i++) {
    if (WMO_SNOW.includes(moab.daily.weathercode[i])) {
      moabSnowDates.push(moab.daily.time[i])
    }
  }
  if (moabSnowDates.length > 0) {
    flags.push({
      property_id: 'moab',
      property_name: 'Moab',
      type: 'snow_opportunity',
      message: 'Snow forecast — photography/winter tourism micro-spike possible.',
      affected_dates: moabSnowDates,
      generated_at: now,
    })
  }

  // ─── Bear Lake + SLC proxy ────────────────────────────────────────────────
  const [bearLake, slc] = await Promise.all([
    fetchForecast(41.9416, -111.4549),
    fetchForecast(40.7608, -111.891), // Salt Lake City as drive-to demand proxy
  ])

  const next7 = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000)

  // SLC warm sunny Sat/Sun → Bear Lake demand boost
  let demandBoostAdded = false
  for (let i = 0; i < slc.daily.time.length && !demandBoostAdded; i++) {
    const date = new Date(slc.daily.time[i] + 'T00:00:00')
    if (date > next7) break
    const dow = date.getDay() // 0=Sun, 6=Sat
    if ((dow === 6 || dow === 0) && celsiusToF(slc.daily.temperature_2m_max[i]) > 75 && slc.daily.precipitation_sum[i] === 0) {
      flags.push({
        property_id: 'bear-lake',
        property_name: 'Bear Lake',
        type: 'demand_boost',
        message: 'Warm sunny SLC weekend forecast — hold or raise Bear Lake prices.',
        affected_dates: [slc.daily.time[i]],
        generated_at: now,
      })
      demandBoostAdded = true
    }
  }

  // Bear Lake cool/wet open Sat/Sun → demand softness
  let demandSoftnessAdded = false
  for (let i = 0; i < bearLake.daily.time.length && !demandSoftnessAdded; i++) {
    const date = new Date(bearLake.daily.time[i] + 'T00:00:00')
    const dow = date.getDay()
    if (dow === 6 || dow === 0) {
      const tempF = celsiusToF(bearLake.daily.temperature_2m_max[i])
      if (tempF < 65 || bearLake.daily.precipitation_sum[i] > 0) {
        flags.push({
          property_id: 'bear-lake',
          property_name: 'Bear Lake',
          type: 'demand_softness',
          message:
            'Cool/wet Bear Lake weekend forecast — consider last-minute discount for open Sat/Sun.',
          affected_dates: [bearLake.daily.time[i]],
          generated_at: now,
        })
        demandSoftnessAdded = true
      }
    }
  }

  // Memorial Day risk window: April 15 – May 31
  const month = today.getMonth() + 1
  const day = today.getDate()
  const inMemorialDayWindow = (month === 4 && day >= 15) || month === 5
  if (inMemorialDayWindow) {
    for (let i = 0; i < bearLake.daily.time.length; i++) {
      if (bearLake.daily.precipitation_sum[i] > 10) {
        flags.push({
          property_id: 'bear-lake',
          property_name: 'Bear Lake',
          type: 'memorial_day_risk',
          message:
            'Late spring precipitation at elevation — monitor Memorial Day weekend demand.',
          affected_dates: [bearLake.daily.time[i]],
          generated_at: now,
        })
        break
      }
    }
  }

  return flags
}
