import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import type { PropertyFormData } from '@/lib/types'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServerSupabaseClient()
  const { data, error } = await supabase
    .from('properties')
    .select('*')
    .order('created_at', { ascending: true })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data)
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { properties: PropertyFormData[] }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { properties } = body
  if (!Array.isArray(properties) || properties.length === 0) {
    return NextResponse.json({ error: 'No properties provided' }, { status: 400 })
  }

  const supabase = createServerSupabaseClient()
  const results = []

  for (const prop of properties) {
    const record = {
      name: prop.name,
      location: prop.location,
      platform: prop.platform,
      base_price: prop.base_price,
      min_price: prop.min_price,
      max_price: prop.max_price,
      amenities: prop.amenities,
      arches_timed_entry_active: prop.arches_timed_entry_active,
      notes: prop.notes,
      updated_at: new Date().toISOString(),
    }

    if (prop.id) {
      const { data, error } = await supabase
        .from('properties')
        .update(record)
        .eq('id', prop.id)
        .select()
        .single()
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
      }
      results.push(data)
    } else {
      const { data, error } = await supabase
        .from('properties')
        .insert({ ...record, created_at: new Date().toISOString() })
        .select()
        .single()
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
      }
      results.push(data)
    }
  }

  return NextResponse.json(results)
}
