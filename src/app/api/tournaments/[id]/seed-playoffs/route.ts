import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.isOrganizer && !(session?.user as any)?.isSuperUser) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id: tournamentId } = params

  // Fetch groups
  const { data: groups } = await supabaseAdmin
    .from('tournament_groups')
    .select('*')
    .eq('tournament_id', tournamentId)
    .order('label')

  if (!groups || groups.length < 2) {
    return NextResponse.json({ error: 'Need at least 2 groups to seed playoffs' }, { status: 400 })
  }

  // Fetch standings per group, ordered by seed
  const groupStandings: Record<string, any[]> = {}
  for (const g of groups) {
    const { data } = await supabaseAdmin
      .from('tournament_standings')
      .select('team_id, seed, seed_override, wins, losses, points_for, points_against')
      .eq('group_id', g.id)
      .eq('tournament_id', tournamentId)
      .order('seed')
    groupStandings[g.label] = data ?? []
  }

  const A = groupStandings['A'] ?? []
  const B = groupStandings['B'] ?? []

  // Cross-seed: A1 vs B4, B2 vs A3, A2 vs B3, B1 vs A4
  const matchups = [
    { team1: A[0]?.team_id, team2: B[3]?.team_id, match_number: 1 }, // A1 vs B4
    { team1: B[1]?.team_id, team2: A[2]?.team_id, match_number: 2 }, // B2 vs A3
    { team1: A[1]?.team_id, team2: B[2]?.team_id, match_number: 3 }, // A2 vs B3
    { team1: B[0]?.team_id, team2: A[3]?.team_id, match_number: 4 }, // B1 vs A4
  ]

  // Fetch QF matches to update
  const { data: qfMatches } = await supabaseAdmin
    .from('tournament_matches')
    .select('id, match_number')
    .eq('tournament_id', tournamentId)
    .eq('stage', 'quarterfinal')
    .order('match_number')

  if (!qfMatches || qfMatches.length < 4) {
    return NextResponse.json({ error: 'QF matches not found' }, { status: 500 })
  }

  // Update each QF match with seeded teams
  for (const mu of matchups) {
    const qf = qfMatches.find((m: any) => m.match_number === mu.match_number)
    if (!qf) continue
    await supabaseAdmin
      .from('tournament_matches')
      .update({
        team1_id: mu.team1 ?? null,
        team2_id: mu.team2 ?? null,
        status: mu.team1 && mu.team2 ? 'pending' : 'pending',
        updated_at: new Date().toISOString(),
      })
      .eq('id', qf.id)
  }

  // Wire up next_match_id: QF1 winner → SF1, QF2 winner → SF1, QF3 winner → SF2, QF4 winner → SF2
  const { data: sfMatches } = await supabaseAdmin
    .from('tournament_matches')
    .select('id, match_number')
    .eq('tournament_id', tournamentId)
    .eq('stage', 'semifinal')
    .order('match_number')

  const { data: finalMatch } = await supabaseAdmin
    .from('tournament_matches')
    .select('id')
    .eq('tournament_id', tournamentId)
    .eq('stage', 'final')
    .single()

  if (sfMatches && qfMatches) {
    const sf1 = sfMatches[0]?.id
    const sf2 = sfMatches[1]?.id
    const nextMap: Record<number, string> = { 1: sf1, 2: sf1, 3: sf2, 4: sf2 }
    for (const qf of qfMatches) {
      await supabaseAdmin
        .from('tournament_matches')
        .update({ next_match_id: nextMap[qf.match_number] })
        .eq('id', qf.id)
    }
  }

  // Wire SF → Final
  if (sfMatches && finalMatch) {
    for (const sf of sfMatches) {
      await supabaseAdmin
        .from('tournament_matches')
        .update({ next_match_id: finalMatch.id })
        .eq('id', sf.id)
    }
  }

  return NextResponse.json({ success: true })
}
