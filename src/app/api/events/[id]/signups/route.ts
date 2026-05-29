import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabase'
import { logAudit } from '@/lib/audit'
import { requireFields } from '@/lib/validate'

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('signups')
    .select('*, users(id, discord_username, ingame_name, discord_avatar)')
    .eq('event_id', params.id)
    .order('priority', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const err = requireFields(body, ['class'])
  if (err) return err
  const supabase = getSupabaseAdmin()

  const userId = session.user.userId

  const { data, error } = await supabase
    .from('signups')
    .insert({
      event_id: params.id,
      user_id: userId,
      class: Array.isArray(body.class) ? body.class : [body.class],
      status: 'confirmed',
      priority: body.priority ?? 999,
    })
    .select()
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session || !session.user.isOrganizer) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const { signupId, ringer, flagged, admin_note, class: playerClass, priority } = body
  if (!signupId) return NextResponse.json({ error: 'signupId required' }, { status: 400 })

  const updates: Record<string, unknown> = {}
  if (ringer      !== undefined) updates.ringer      = ringer
  if (flagged     !== undefined) updates.flagged     = flagged
  if (admin_note  !== undefined) updates.admin_note  = admin_note
  if (playerClass !== undefined) updates.class       = playerClass
  if (priority    !== undefined) updates.priority    = priority

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No valid fields provided' }, { status: 400 })
  }

  const supabase = getSupabaseAdmin()

  // Fetch existing signup for audit context
  const { data: existing } = await supabase
    .from('signups')
    .select('*, users(id, discord_username, ingame_name)')
    .eq('id', signupId)
    .maybeSingle()

  const targetName = (existing?.users as any)?.ingame_name || (existing?.users as any)?.discord_username || signupId
  const targetId = (existing?.users as any)?.id ?? null

  // Fetch event name for context
  const { data: event } = await supabase
    .from('events')
    .select('name')
    .eq('id', params.id)
    .maybeSingle()
  const eventName = event?.name ?? null

  const { data, error } = await supabase
    .from('signups')
    .update(updates)
    .eq('id', signupId)
    .select()
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const actorId = session.user.userId
  const actorName = session.user.name ?? 'unknown'

  // Audit flag changes
  if ('flagged' in updates && existing) {
    await logAudit({
      action: updates.flagged ? 'signup.flag' : 'signup.unflag',
      actorId,
      actorName,
      targetId,
      targetName,
      metadata: { event_id: params.id, event_name: eventName },
    })
  }

  // Audit note changes
  if ('admin_note' in updates && updates.admin_note !== existing?.admin_note) {
    await logAudit({
      action: 'signup.note',
      actorId,
      actorName,
      targetId,
      targetName,
      metadata: { event_id: params.id, event_name: eventName, note: updates.admin_note },
    })
  }

  // Audit ringer toggle
  if ('ringer' in updates && existing && updates.ringer !== existing.ringer) {
    await logAudit({
      action: updates.ringer ? 'signup.ringer_on' : 'signup.ringer_off',
      actorId,
      actorName,
      targetId,
      targetName,
      metadata: { event_id: params.id, event_name: eventName },
    })
  }

  return NextResponse.json(data)
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const signupId = searchParams.get('signupId')
  const userId = session.user.userId
  const isAdmin = session.user.isOrganizer || session.user.isSuperUser

  if (!signupId) return NextResponse.json({ error: 'signupId required' }, { status: 400 })

  const supabase = getSupabaseAdmin()

  // Fetch signup for audit context
  const { data: existing } = await supabase
    .from('signups')
    .select('*, users(id, discord_username, ingame_name)')
    .eq('id', signupId)
    .maybeSingle()

  // Only allow delete if self or admin
  if (!isAdmin && existing?.user_id !== userId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { data: event } = await supabase
    .from('events')
    .select('name')
    .eq('id', params.id)
    .maybeSingle()

  const targetName = (existing?.users as any)?.ingame_name || (existing?.users as any)?.discord_username || 'unknown'
  const targetId = (existing?.users as any)?.id ?? null

  const { error } = await supabase.from('signups').delete().eq('id', signupId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Only audit if admin removed someone else
  if (isAdmin && existing?.user_id !== userId) {
    await logAudit({
      action: 'signup.delete',
      actorId: userId,
      actorName: session.user?.name ?? 'unknown',
      targetId,
      targetName,
      metadata: { event_id: params.id, event_name: event?.name ?? null },
    })
  }

  return NextResponse.json({ success: true })
}
