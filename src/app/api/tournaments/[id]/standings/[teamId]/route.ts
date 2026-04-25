import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string; teamId: string } }
) {
  const session = await getServerSession(authOptions)
  const isAdmin = session?.user?.isOrganizer || (session?.user as any)?.isSuperUser
  if (!isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const { wins, losses, points_for, points_against, seed_override } = body

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (wins !== undefined) updates.wins = wins
  if (losses !== undefined) updates.losses = losses
  if (points_for !== undefined) updates.points_for = points_for
  if (points_against !== undefined) updates.points_against = points_against
  if (seed_override !== undefined) updates.seed_override = seed_override

  const { data, error } = await supabaseAdmin
    .from('tournament_standings')
    .update(updates)
    .eq('tournament_id', params.id)
    .eq('team_id', params.teamId)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
