import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabase'
import { logAudit } from '@/lib/audit'

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = getSupabaseAdmin()

  const { data: tournament, error } = await supabase
    .from('tournaments')
    .select('*')
    .eq('id', params.id)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!tournament) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data: groups } = await supabase
    .from('tournament_groups')
    .select('*')
    .eq('tournament_id', params.id)

  const { data: matches } = await supabase
    .from('tournament_matches')
    .select('*, team1:teams!team1_id(id,name,color), team2:teams!team2_id(id,name,color), winner:teams!winner_id(id,name,color)')
    .eq('tournament_id', params.id)
    .order('round', { ascending: true })
    .order('match_number', { ascending: true })

  const { data: standings } = await supabase
    .from('tournament_standings')
    .select('*, team:teams(id,name,color)')
    .eq('tournament_id', params.id)

  return NextResponse.json({ tournament, groups: groups ?? [], matches: matches ?? [], standings: standings ?? [] })
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session || !(session.user as any).isSuperUser && !(session.user as any).isOrganizer) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const supabase = getSupabaseAdmin()

  if (body.action === 'declare_champion') {
    const { champion_team_id } = body
    if (!champion_team_id) return NextResponse.json({ error: 'champion_team_id required' }, { status: 400 })

    // Fetch team name for audit
    const { data: team } = await supabase
      .from('teams')
      .select('name, event_id')
      .eq('id', champion_team_id)
      .maybeSingle()

    // Fetch event name
    const { data: event } = await supabase
      .from('events')
      .select('name')
      .eq('id', team?.event_id)
      .maybeSingle()

    const { error: tErr } = await supabase
      .from('tournaments')
      .update({ champion_team_id, status: 'complete' })
      .eq('id', params.id)

    if (tErr) return NextResponse.json({ error: tErr.message }, { status: 500 })

    const { error: eErr } = await supabase
      .from('events')
      .update({ status: 'completed' })
      .eq('id', team?.event_id)

    if (eErr) return NextResponse.json({ error: eErr.message }, { status: 500 })

    await logAudit({
      action: 'tournament.champion',
      actorId: (session.user as any).userId,
      actorName: session.user?.name ?? 'unknown',
      targetId: champion_team_id,
      targetName: team?.name ?? 'unknown team',
      metadata: {
        tournament_id: params.id,
        event_id: team?.event_id ?? null,
        event_name: event?.name ?? null,
      },
    })

    return NextResponse.json({ success: true })
  }

  // Generic tournament update
  const { action, ...updates } = body
  const { data, error } = await supabase
    .from('tournaments')
    .update(updates)
    .eq('id', params.id)
    .select()
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
