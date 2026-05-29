import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabase'

const CLASSES = ['rifle','third','heavy','sniper','flex']
const TWO_CLASS_PAIRS = [['rifle','third'],['rifle','heavy'],['third','heavy'],['heavy','sniper'],['rifle','sniper']]

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.isSuperUser) {
    return NextResponse.json({ error: 'SuperUser only' }, { status: 403 })
  }

  const supabase = getSupabaseAdmin()

  try {
    // 1. Fetch fake users
    const { data: fakeUsers, error: usersErr } = await supabase
      .from('users')
      .select('id, discord_id, ingame_name, discord_username')
      .like('discord_id', '1000000000000000%')
    if (usersErr || !fakeUsers || fakeUsers.length < 10) {
      return NextResponse.json({ error: `Need at least 10 fake users, found ${fakeUsers?.length ?? 0}` }, { status: 400 })
    }

    // 2. Create event
    const now = new Date()
    const draftDate = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
    const label = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    const { data: event, error: evErr } = await supabase
      .from('events')
      .insert({
        name: `[TEST] Draft ${label}`,
        type: 'draft',
        format: '6v6',
        status: 'scheduled',
        half_length: 20,
        capacity: 48,
        slots_rifle: 2,
        slots_third: 1,
        slots_heavy: 2,
        slots_sniper: 1,
        maps: [],
        starts_at: draftDate.toISOString(),
        signup_opens_at: now.toISOString(),
        checkin_opens_at: draftDate.toISOString(),
        notes: 'Auto-generated test event (signups only) — safe to delete',
        created_by: session!.user.userId,
      })
      .select()
      .single()
    if (evErr || !event) return NextResponse.json({ error: evErr?.message ?? 'Failed to create event' }, { status: 500 })

    // 3. Sign up all fake users with random classes — no teams, no picks
    const signupRows = fakeUsers.map((u, idx) => {
      const useTwoClasses = Math.random() > 0.5
      const cls = useTwoClasses
        ? TWO_CLASS_PAIRS[Math.floor(Math.random() * TWO_CLASS_PAIRS.length)]
        : [CLASSES[Math.floor(Math.random() * CLASSES.length)]]
      return { event_id: event.id, user_id: u.id, class: cls, priority: idx + 1 }
    })
    const { error: signupErr } = await supabase.from('signups').insert(signupRows)
    if (signupErr) return NextResponse.json({ error: signupErr.message }, { status: 500 })

    return NextResponse.json({ eventId: event.id, eventName: event.name })
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? 'Unknown error' }, { status: 500 })
  }
}
