import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.isOrganizer && !(session?.user as any)?.isSuperUser) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const {
    event_id,
    format = 'rr_elimination',
    num_groups = 2,
    teams_per_group = 4,
    rounds_per_group = 5,
    num_advance = 4,
    groups, // [{ label: 'A', team_ids: [uuid, uuid, ...] }, ...]
  } = body

  if (!event_id || !groups || !Array.isArray(groups)) {
    return NextResponse.json({ error: 'Missing event_id or groups' }, { status: 400 })
  }

  // Guard: check if tournament already exists for this event
  const { data: existing } = await supabaseAdmin
    .from('tournaments')
    .select('id')
    .eq('event_id', event_id)
    .single()
  if (existing) {
    return NextResponse.json({ error: 'A tournament already exists for this event', tournament_id: existing.id }, { status: 409 })
  }

  // 1. Create tournament
  const { data: tournament, error: tErr } = await supabaseAdmin
    .from('tournaments')
    .insert({ event_id, format, num_groups, teams_per_group, rounds_per_group, num_advance, status: 'active' })
    .select()
    .single()
  if (tErr) return NextResponse.json({ error: tErr.message }, { status: 500 })

  // 2. Create groups + memberships + standings rows
  for (const g of groups) {
    const { data: group, error: gErr } = await supabaseAdmin
      .from('tournament_groups')
      .insert({ tournament_id: tournament.id, label: g.label })
      .select()
      .single()
    if (gErr) return NextResponse.json({ error: gErr.message }, { status: 500 })

    // Group memberships
    const memberships = g.team_ids.map((team_id: string, i: number) => ({
      group_id: group.id,
      team_id,
      seed: i + 1,
    }))
    await supabaseAdmin.from('tournament_group_teams').insert(memberships)

    // Standings rows
    const standings = g.team_ids.map((team_id: string) => ({
      tournament_id: tournament.id,
      group_id: group.id,
      team_id,
      wins: 0, losses: 0, points_for: 0, points_against: 0,
    }))
    await supabaseAdmin.from('tournament_standings').insert(standings)

    // 3. Generate round robin matches for this group
    const teamIds: string[] = g.team_ids
    const matchInserts = []
    let matchNumber = 1

    const n = teamIds.length
    const teams = [...teamIds]
    if (n % 2 !== 0) teams.push('BYE')
    const half = teams.length / 2

    for (let round = 1; round <= teams.length - 1; round++) {
      for (let i = 0; i < half; i++) {
        const t1 = teams[i]
        const t2 = teams[teams.length - 1 - i]
        if (t1 !== 'BYE' && t2 !== 'BYE') {
          matchInserts.push({
            tournament_id: tournament.id,
            group_id: group.id,
            stage: 'group',
            round,
            match_number: matchNumber++,
            team1_id: t1,
            team2_id: t2,
            status: 'pending',
          })
        }
      }
      teams.splice(1, 0, teams.pop()!)
    }

    await supabaseAdmin.from('tournament_matches').insert(matchInserts)
  }

  // 4. Create placeholder playoff matches
  const playoffInserts = [
    { tournament_id: tournament.id, stage: 'quarterfinal', round: 1, match_number: 1, status: 'pending' },
    { tournament_id: tournament.id, stage: 'quarterfinal', round: 1, match_number: 2, status: 'pending' },
    { tournament_id: tournament.id, stage: 'quarterfinal', round: 1, match_number: 3, status: 'pending' },
    { tournament_id: tournament.id, stage: 'quarterfinal', round: 1, match_number: 4, status: 'pending' },
    { tournament_id: tournament.id, stage: 'semifinal', round: 2, match_number: 1, status: 'pending' },
    { tournament_id: tournament.id, stage: 'semifinal', round: 2, match_number: 2, status: 'pending' },
    { tournament_id: tournament.id, stage: 'final', round: 3, match_number: 1, status: 'pending' },
  ]
  await supabaseAdmin.from('tournament_matches').insert(playoffInserts)

  return NextResponse.json({ tournament })
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const event_id = searchParams.get('event_id')
  if (!event_id) return NextResponse.json({ error: 'Missing event_id' }, { status: 400 })

  const { data, error } = await supabaseAdmin
    .from('tournaments')
    .select('*')
    .eq('event_id', event_id)
    .single()

  if (error && error.code !== 'PGRST116') {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json(data ?? null)
}
