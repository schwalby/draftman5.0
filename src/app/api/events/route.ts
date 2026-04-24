import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Fetch events
  const { data: events, error } = await supabaseAdmin
    .from('events')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!events || events.length === 0) {
    return NextResponse.json([])
  }

  // Fetch signup counts for all events in one query
  const eventIds = events.map((e: any) => e.id)
  const { data: signupCounts } = await supabaseAdmin
    .from('signups')
    .select('event_id')
    .in('event_id', eventIds)
    .neq('status', 'withdrawn')

  // Build a count map
  const countMap: Record<string, number> = {}
  for (const s of signupCounts ?? []) {
    countMap[s.event_id] = (countMap[s.event_id] ?? 0) + 1
  }

  // Attach signup_count to each event
  const eventsWithCounts = events.map((e: any) => ({
    ...e,
    signup_count: countMap[e.id] ?? 0,
  }))

  return NextResponse.json(eventsWithCounts)
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.isOrganizer) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()

  const { data, error } = await supabaseAdmin
    .from('events')
    .insert({
      name: body.name,
      type: body.type,
      format: body.format,
      status: 'draft',
      half_length: body.half_length,
      maps: body.maps ?? [],
      slots_rifle: body.slots_rifle,
      slots_third: body.slots_third,
      slots_light: body.slots_light,
      slots_heavy: body.slots_heavy,
      slots_sniper: body.slots_sniper,
      capacity: body.capacity,
      starts_at: body.starts_at ?? null,
      signup_opens_at: body.signup_opens_at ?? null,
      checkin_opens_at: body.checkin_opens_at ?? null,
      notes: body.notes ?? null,
      created_by: session.user.userId,
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data, { status: 201 })
}
