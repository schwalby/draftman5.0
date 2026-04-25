import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.isOrganizer && !(session?.user as any)?.isSuperUser) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const { id } = params
  const { data: user, error: userError } = await supabaseAdmin
    .from('users')
    .select('id, ingame_name, discord_username, discord_avatar, discord_id, is_organizer, is_superuser, is_captain, created_at')
    .eq('id', id)
    .single()
  if (userError) return NextResponse.json({ error: userError.message }, { status: 500 })
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })
  const { data: signups } = await supabaseAdmin
    .from('signups')
    .select('id, class, priority, ringer, captain, flagged, checked_in, signed_up_at, events(id, name, starts_at, format, status)')
    .eq('user_id', id)
    .order('signed_up_at', { ascending: false })
  const { data: draftPicks } = await supabaseAdmin
    .from('draft_picks')
    .select('id, pick_number, class, picked_at, events(id, name, starts_at, format), teams(id, name, color)')
    .eq('user_id', id)
    .order('picked_at', { ascending: false })
  return NextResponse.json({ user, signups: signups || [], draftPicks: draftPicks || [] })
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions)
  if (!(session?.user as any)?.isSuperUser) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const allowed = ['is_organizer', 'is_superuser', 'is_captain']
  const updates: Record<string, unknown> = {}
  for (const key of allowed) {
    if (body[key] !== undefined) updates[key] = body[key]
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
  }

  const { data, error } = await supabaseAdmin
    .from('users')
    .update(updates)
    .eq('id', params.id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
