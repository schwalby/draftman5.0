import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'

const VALID_CLASSES = ['rifle', 'third', 'heavy', 'sniper', 'flex']

// GET /api/events/[id]/signups
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const { data, error } = await supabaseAdmin
    .from('signups')
    .select('id, user_id, class, priority, flagged, ringer, captain, admin_note, checked_in, signed_up_at, users(discord_username, ingame_name, is_captain)')
    .eq('event_id', params.id)
    .order('priority', { ascending: true })
    .order('signed_up_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// POST /api/events/[id]/signups
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const classes: string[] = Array.isArray(body.class) ? body.class : [body.class]

  if (classes.length === 0 || classes.length > 2) {
    return NextResponse.json({ error: 'Select 1 or 2 classes' }, { status: 400 })
  }
  if (!classes.every(c => VALID_CLASSES.includes(c))) {
    return NextResponse.json({ error: 'Invalid class' }, { status: 400 })
  }

  const { data: existing } = await supabaseAdmin
    .from('signups')
    .select('id')
    .eq('event_id', params.id)
    .eq('user_id', session.user.userId)
    .single()

  if (existing) {
    return NextResponse.json({ error: 'Already signed up' }, { status: 409 })
  }

  const { count } = await supabaseAdmin
    .from('signups')
    .select('*', { count: 'exact', head: true })
    .eq('event_id', params.id)

  const { data, error } = await supabaseAdmin
    .from('signups')
    .insert({
      event_id: params.id,
      user_id: session.user.userId,
      class: classes,
      priority: (count ?? 0) + 1,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}

// DELETE /api/events/[id]/signups
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { error } = await supabaseAdmin
    .from('signups')
    .delete()
    .eq('event_id', params.id)
    .eq('user_id', session.user.userId)

  if (error) {
    console.error('DELETE signups error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ success: true })
}
