import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params

  // Fetch tournament
  const { data: tournament, error: tErr } = await getSupabaseAdmin()
    .from('tournaments')
    .select('*')
    .eq('id', id)
    .single()
  if (tErr) return NextResponse.json({ error: tErr.message }, { status: 500 })

  // Fetch groups
  const { data: groups } = await getSupabaseAdmin()
    .from('tournament_groups')
    .select('*')
    .eq('tournament_id', id)
    .order('label')

  // Fetch group teams
  const { data: groupTeams } = await getSupabaseAdmin()
    .from('tournament_group_teams')
    .select('*, teams(id, name, color, captain_id)')
    .in('group_id', (groups ?? []).map((g: any) => g.id))

  // Fetch all matches
  const { data: matches } = await getSupabaseAdmin()
    .from('tournament_matches')
    .select(`
      *,
      team1:team1_id(id, name, color),
      team2:team2_id(id, name, color),
      winner:winner_id(id, name, color)
    `)
    .eq('tournament_id', id)
    .order('stage')
    .order('round')
    .order('match_number')

  // Fetch standings
  const { data: standings } = await getSupabaseAdmin()
    .from('tournament_standings')
    .select('*, teams(id, name, color)')
    .eq('tournament_id', id)
    .order('wins', { ascending: false })
    .order('points_for', { ascending: false })

  return NextResponse.json({ tournament, groups, groupTeams, matches, standings })
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params
  const body = await req.json()

  if (body.action === 'declare_champion') {
    const db = getSupabaseAdmin()

    // Find the confirmed final match
    const { data: finalMatch, error: fErr } = await db
      .from('tournament_matches')
      .select('*, winner:winner_id(id, name, color)')
      .eq('tournament_id', id)
      .eq('stage', 'final')
      .eq('status', 'complete')
      .maybeSingle()

    if (fErr) return NextResponse.json({ error: fErr.message }, { status: 500 })
    if (!finalMatch) return NextResponse.json({ error: 'Final match not complete yet' }, { status: 400 })
    if (!finalMatch.winner_id) return NextResponse.json({ error: 'Final match has no winner' }, { status: 400 })

    // Write champion to tournaments table
    const { data: tournament, error: tErr } = await db
      .from('tournaments')
      .update({ champion_team_id: finalMatch.winner_id })
      .eq('id', id)
      .select('*, event_id')
      .single()

    if (tErr) return NextResponse.json({ error: tErr.message }, { status: 500 })

    // Flip event status to completed
    const { error: eErr } = await db
      .from('events')
      .update({ status: 'completed' })
      .eq('id', tournament.event_id)

    if (eErr) return NextResponse.json({ error: eErr.message }, { status: 500 })

    return NextResponse.json({ success: true, champion: finalMatch.winner })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
