import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Only SuperUsers can change roles
  const { data: me, error: meErr } = await supabaseAdmin
    .from('users')
    .select('is_superuser')
    .eq('id', session.user.userId)
    .single()

  if (meErr || !me?.is_superuser) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Guard: SuperUser cannot remove their own superuser status
  if (params.id === session.user.userId) {
    const body = await req.json()
    if ('is_superuser' in body && body.is_superuser === false) {
      return NextResponse.json(
        { error: 'You cannot remove your own SuperUser access' },
        { status: 400 }
      )
    }
  }

  const body = await req.json()

  // Only allow these two fields to be patched
  const allowed: Record<string, boolean> = {}
  if (typeof body.is_organizer === 'boolean') allowed.is_organizer = body.is_organizer
  if (typeof body.is_superuser === 'boolean') allowed.is_superuser = body.is_superuser

  // Promoting to SuperUser automatically grants Draft Admin too
  if (allowed.is_superuser === true) {
    allowed.is_organizer = true
  }

  if (Object.keys(allowed).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
  }

  const { data, error } = await supabaseAdmin
    .from('users')
    .update(allowed)
    .eq('id', params.id)
    .select('id, discord_username, ingame_name, is_organizer, is_superuser')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data)
}
