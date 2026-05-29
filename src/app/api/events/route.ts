import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabase'
import { requireFields } from '@/lib/validate'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = getSupabaseAdmin()

  // Fetch events
  const { data: events, error } = await supabase
    .from('events')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!events || events.length === 0) {
    return NextResponse.json([])
  }

  const eventIds = events.map((e: any) => e.id)

  // Fetch signup counts and current user's signups in parallel
  const [{ data: signupCounts }, { data: mySignups }] = await Promise.all([
    supabase
      .from('signups')
      .select('event_id')
      .in('event_id', eventIds)
      .neq('status', 'withdrawn'),
    supabase
      .from('signups')
      .select('event_id, class')
      .in('event_id', eventIds)
      .eq('user_id', session.user.userId),
  ])

  const countMap: Record<string, number> = {}
  for (const s of signupCounts ?? []) {
    countMap[s.event_id] = (countMap[s.event_id] ?? 0) + 1
  }

  const mySignupMap: Record<string, { class: string[] }> = {}
  for (const s of mySignups ?? []) {
    mySignupMap[s.event_id] = { class: s.class }
  }

  const eventsWithCounts = events.map((e: any) => ({
    ...e,
    signup_count: countMap[e.id] ?? 0,
    my_signup: mySignupMap[e.id] ?? null,
  }))

  return NextResponse.json(eventsWithCounts)
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.isOrganizer) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const err = requireFields(body, ['name', 'type', 'format'])
  if (err) return err

  const supabase = getSupabaseAdmin()

  const { data, error } = await supabase
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
