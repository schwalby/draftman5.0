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
