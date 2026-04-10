import { createServerSupabaseClient } from './supabase-server'

export async function syncEvents(): Promise<{ added: number }> {
  const supabase = createServerSupabaseClient()
  let added = 0

  // Load existing events to avoid duplication (match by name + event_date)
  const { data: existing } = await supabase
    .from('events')
    .select('name, event_date')
    .eq('is_active', true)

  const existingSet = new Set(
    (existing || []).map((e) => `${e.name}|${e.event_date}`)
  )

  // Secondary: Eventbrite — wrapped in try/catch, fails silently
  // The app functions fully without Eventbrite; seeded events are the primary source.
  try {
    const apiKey = process.env.EVENTBRITE_API_KEY
    if (!apiKey) throw new Error('No Eventbrite API key configured')

    const searches = [
      { q: 'Moab Utah', location: 'Moab, UT' },
      { q: 'Bear Lake Utah', location: 'Garden City, UT' },
    ]

    for (const search of searches) {
      const response = await fetch(
        `https://www.eventbriteapi.com/v3/events/search/` +
          `?q=${encodeURIComponent(search.q)}` +
          `&location.address=${encodeURIComponent(search.location)}` +
          `&token=${apiKey}`,
        { next: { revalidate: 86400 } }
      )

      if (!response.ok) {
        throw new Error(`Eventbrite returned ${response.status}`)
      }

      const data = (await response.json()) as {
        events?: Array<{
          name?: { text?: string }
          start?: { local?: string }
          end?: { local?: string }
          url?: string
        }>
      }

      for (const event of data.events ?? []) {
        const eventDate = event.start?.local?.split('T')[0]
        if (!eventDate) continue

        const name = event.name?.text || 'Unknown Event'
        const key = `${name}|${eventDate}`
        if (existingSet.has(key)) continue

        const { error } = await supabase.from('events').insert({
          name,
          event_date: eventDate,
          end_date: event.end?.local?.split('T')[0] ?? null,
          event_type: 'community',
          is_active: true,
          notes: event.url ?? null,
          created_at: new Date().toISOString(),
        })

        if (!error) {
          added++
          existingSet.add(key)
        }
      }
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.warn('Eventbrite unavailable — using seeded events only:', message)
  }

  return { added }
}
