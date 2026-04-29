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
  if (!session || !(session.user as any).isSuperUser) {
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
  if (body.is_superuser === false && params.id === (session.user as any).userId) {
    return NextResponse.json({ error: 'Cannot remove your own SuperUser status' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('users')
    .update(body)
    .eq('id', params.id)
    .select()
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Audit role changes
  const actorId = (session.user as any).userId
  const actorName = session.user?.name ?? 'unknown'

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
  if (!session || !(session.user as any).isSuperUser) {
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
    actorId: (session.user as any).userId,
    actorName: session.user?.name ?? 'unknown',
    targetId: params.id,
    targetName,
    metadata: {},
  })

  return NextResponse.json({ success: true })
}
