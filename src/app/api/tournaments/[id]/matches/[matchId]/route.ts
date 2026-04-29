import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabase'
import { logAudit } from '@/lib/audit'

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string; matchId: string } }
) {
  const session = await getServerSession(authOptions)
  const supabase = getSupabaseAdmin()
  const body = await req.json()
  const { action } = body

  // Bot report — authenticated by secret header, not session
  if (action === 'report') {
    const botSecret = req.headers.get('x-bot-secret')
    if (!botSecret || botSecret !== process.env.BOT_SECRET) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { winner_id, score_team1, score_team2, map, ktp_match_id } = body

    const { data: match } = await supabase
      .from('tournament_matches')
      .select('*, team1:teams!team1_id(name), team2:teams!team2_id(name)')
      .eq('id', params.matchId)
      .maybeSingle()

    const { error } = await supabase
      .from('tournament_matches')
      .update({
        winner_id,
        score_team1,
        score_team2,
        map: map ?? null,
        ktp_match_id: ktp_match_id ?? null,
        status: 'awaiting_confirmation',
        confirmed: false,
        updated_at: new Date().toISOString(),
      })
      .eq('id', params.matchId)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Determine winner name
    const winnerName =
      winner_id === match?.team1_id
        ? (match?.team1 as any)?.name
        : (match?.team2 as any)?.name

    await logAudit({
      action: 'match.report',
      actorId: null,
      actorName: 'KTP Score Bot',
      targetId: params.matchId,
      targetName: `${(match?.team1 as any)?.name ?? '?'} vs ${(match?.team2 as any)?.name ?? '?'}`,
      metadata: {
        tournament_id: params.id,
        winner: winnerName,
        score: `${score_team1}–${score_team2}`,
        map: map ?? null,
        ktp_match_id: ktp_match_id ?? null,
      },
    })

    return NextResponse.json({ success: true })
  }

  // All other actions require a valid session
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const isSuperUser = (session.user as any).isSuperUser
  const isOrganizer = (session.user as any).isOrganizer
  const isCaptain = (session.user as any).isCaptain
  const canConfirm = isSuperUser || isOrganizer || isCaptain
  const actorId = (session.user as any).userId
  const actorName = session.user?.name ?? 'unknown'

  const { data: match } = await supabase
    .from('tournament_matches')
    .select('*, team1:teams!team1_id(name), team2:teams!team2_id(name), winner:teams!winner_id(name)')
    .eq('id', params.matchId)
    .maybeSingle()

  const matchLabel = `${(match?.team1 as any)?.name ?? '?'} vs ${(match?.team2 as any)?.name ?? '?'}`

  if (action === 'confirm') {
    if (!canConfirm) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { error } = await supabase
      .from('tournament_matches')
      .update({
        status: 'complete',
        confirmed: true,
        confirmed_by: actorId,
        confirmed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', params.matchId)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Recalculate standings if group stage
    if (match?.group_id) {
      await recalcStandings(supabase, params.id, match.group_id)
    }

    // Advance bracket
    await advanceBracket(supabase, match, params.id)

    await logAudit({
      action: 'match.confirm',
      actorId,
      actorName,
      targetId: params.matchId,
      targetName: matchLabel,
      metadata: {
        tournament_id: params.id,
        winner: (match?.winner as any)?.name ?? null,
        score: `${match?.score_team1}–${match?.score_team2}`,
        map: match?.map ?? null,
      },
    })

    return NextResponse.json({ success: true })
  }

  if (action === 'reject') {
    if (!canConfirm) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { reason } = body
    const { error } = await supabase
      .from('tournament_matches')
      .update({
        status: 'pending',
        winner_id: null,
        score_team1: null,
        score_team2: null,
        confirmed: false,
        confirmed_by: null,
        confirmed_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', params.matchId)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    await logAudit({
      action: 'match.reject',
      actorId,
      actorName,
      targetId: params.matchId,
      targetName: matchLabel,
      metadata: { tournament_id: params.id, reason: reason ?? null },
    })

    return NextResponse.json({ success: true })
  }

  if (action === 'edit') {
    if (!isOrganizer && !isSuperUser) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { winner_id, score_team1, score_team2, map, reason } = body

    // Save to audit edits table
    await supabase.from('tournament_match_edits').insert({
      match_id: params.matchId,
      edited_by: actorId,
      source: 'manual',
      prev_winner_id: match?.winner_id,
      new_winner_id: winner_id,
      prev_score_team1: match?.score_team1,
      prev_score_team2: match?.score_team2,
      new_score_team1: score_team1,
      new_score_team2: score_team2,
      note: reason ?? null,
    })

    const { error } = await supabase
      .from('tournament_matches')
      .update({
        winner_id,
        score_team1,
        score_team2,
        map: map ?? match?.map,
        status: 'complete',
        confirmed: true,
        confirmed_by: actorId,
        confirmed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', params.matchId)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    if (match?.group_id) {
      await recalcStandings(supabase, params.id, match.group_id)
    }

    await advanceBracket(supabase, { ...match, winner_id, score_team1, score_team2 }, params.id)

    // Determine winner/loser names
    const winnerName =
      winner_id === match?.team1_id
        ? (match?.team1 as any)?.name
        : (match?.team2 as any)?.name

    await logAudit({
      action: 'match.edit',
      actorId,
      actorName,
      targetId: params.matchId,
      targetName: matchLabel,
      metadata: {
        tournament_id: params.id,
        winner: winnerName,
        prev_score: `${match?.score_team1 ?? '?'}–${match?.score_team2 ?? '?'}`,
        new_score: `${score_team1}–${score_team2}`,
        map: map ?? match?.map ?? null,
        reason: reason ?? null,
      },
    })

    return NextResponse.json({ success: true })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}

// ── Helpers ────────────────────────────────────────────────────────────────

async function recalcStandings(supabase: any, tournamentId: string, groupId: string) {
  const { data: matches } = await supabase
    .from('tournament_matches')
    .select('*')
    .eq('group_id', groupId)
    .eq('status', 'complete')

  if (!matches) return

  const { data: groupTeams } = await supabase
    .from('tournament_group_teams')
    .select('team_id')
    .eq('group_id', groupId)

  if (!groupTeams) return

  const stats: Record<string, { wins: number; losses: number; pf: number; pa: number }> = {}
  for (const gt of groupTeams) {
    stats[gt.team_id] = { wins: 0, losses: 0, pf: 0, pa: 0 }
  }

  for (const m of matches) {
    if (!m.winner_id || !m.team1_id || !m.team2_id) continue
    const loserId = m.winner_id === m.team1_id ? m.team2_id : m.team1_id
    if (stats[m.winner_id]) {
      stats[m.winner_id].wins++
      stats[m.winner_id].pf += m.score_team1 ?? 0
      stats[m.winner_id].pa += m.score_team2 ?? 0
    }
    if (stats[loserId]) {
      stats[loserId].losses++
      stats[loserId].pf += m.score_team2 ?? 0
      stats[loserId].pa += m.score_team1 ?? 0
    }
  }

  for (const [teamId, s] of Object.entries(stats)) {
    await supabase
      .from('tournament_standings')
      .update({ wins: s.wins, losses: s.losses, points_for: s.pf, points_against: s.pa })
      .eq('tournament_id', tournamentId)
      .eq('team_id', teamId)
  }
}

async function advanceBracket(supabase: any, match: any, tournamentId: string) {
  if (!match?.next_match_id || !match?.winner_id) return
  const { data: nextMatch } = await supabase
    .from('tournament_matches')
    .select('team1_id, team2_id')
    .eq('id', match.next_match_id)
    .maybeSingle()
  if (!nextMatch) return
  const updateField = nextMatch.team1_id ? 'team2_id' : 'team1_id'
  await supabase
    .from('tournament_matches')
    .update({ [updateField]: match.winner_id })
    .eq('id', match.next_match_id)
}
