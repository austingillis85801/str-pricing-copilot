import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { runRulesEngine } from '@/lib/rules-engine'

export async function POST() {
  const session = await getServerSession(authOptions)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServerSupabaseClient()
  const { data: properties, error } = await supabase
    .from('properties')
    .select('id')
    .order('created_at', { ascending: true })

  if (error || !properties || properties.length === 0) {
    return NextResponse.json({ error: 'No properties found' }, { status: 404 })
  }

  try {
    const results = await Promise.all(
      properties.map((p) => runRulesEngine(p.id))
    )
    return NextResponse.json(results)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Rules engine failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
