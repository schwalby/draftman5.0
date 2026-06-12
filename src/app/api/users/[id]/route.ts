import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabase'
import { logAudit } from '@/lib/audit'

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', params.id)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json(data)
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session || !session.user.isSuperUser) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const supabase = getSupabaseAdmin()

  // Fetch target user for audit name
  const { data: targetUser } = await supabase
    .from('users')
    .select('id, discord_username, ingame_name, is_organizer, is_superuser, is_captain')
    .eq('id', params.id)
    .maybeSingle()

  const targetName = targetUser?.ingame_name || targetUser?.discord_username || params.id

  // Self-demotion guard for SuperUser
  if (body.is_superuser === false && params.id === session.user.userId) {
    return NextResponse.json({ error: 'Cannot remove your own SuperUser status' }, { status: 400 })
  }

  // Allowlist — never pass the raw body to .update() (mass assignment, §4.2). Only these
  // fields are editable here; anything else in the body is ignored.
  const allowed = ['is_organizer', 'is_superuser', 'is_captain', 'ingame_name']
  const updates: Record<string, unknown> = {}
  for (const key of allowed) {
    if (body[key] !== undefined) updates[key] = body[key]
  }
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No updatable fields provided' }, { status: 400 })
  }
  updates.updated_at = new Date().toISOString()

  const { data, error } = await supabase
    .from('users')
    .update(updates)
    .eq('id', params.id)
    .select()
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Audit role changes
  const actorId = session.user.userId
  const actorName = session.user.name ?? 'unknown'

  const roleFields: Array<{ field: string; role: string }> = [
    { field: 'is_superuser', role: 'SuperUser' },
    { field: 'is_organizer', role: 'Draft Admin' },
    { field: 'is_captain', role: 'Captain' },
  ]

  for (const { field, role } of roleFields) {
    if (field in body && targetUser) {
      const prev = (targetUser as any)[field]
      const next = body[field]
      if (prev !== next) {
        await logAudit({
          action: next ? 'role.grant' : 'role.revoke',
          actorId,
          actorName,
          targetId: params.id,
          targetName,
          metadata: { role, prev, next },
        })
      }
    }
  }

  return NextResponse.json(data)
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session || !session.user.isSuperUser) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const supabase = getSupabaseAdmin()

  // Fetch target before delete for audit
  const { data: targetUser } = await supabase
    .from('users')
    .select('id, discord_username, ingame_name')
    .eq('id', params.id)
    .maybeSingle()

  const targetName = targetUser?.ingame_name || targetUser?.discord_username || params.id

  const { error } = await supabase.from('users').delete().eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await logAudit({
    action: 'user.delete',
    actorId: session.user.userId,
    actorName: session.user.name ?? 'unknown',
    targetId: params.id,
    targetName,
    metadata: {},
  })

  return NextResponse.json({ success: true })
}
