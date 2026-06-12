import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabase'
import { logAudit } from '@/lib/audit'
import { requireFields } from '@/lib/validate'

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

    const reportErr = requireFields(body, ['winner_id', 'score_team1', 'score_team2'])
    if (reportErr) return reportErr
    const { winner_id, score_team1, score_team2, map, ktp_match_id,
            score_half1_team1, score_half1_team2, score_half2_team1, score_half2_team2 } = body

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
        score_half1_team1: score_half1_team1 ?? null,
        score_half1_team2: score_half1_team2 ?? null,
        score_half2_team1: score_half2_team1 ?? null,
        score_half2_team2: score_half2_team2 ?? null,
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

  if (action === 'simulate') {
    if (!session?.user?.isOrganizer && !session?.user?.isSuperUser) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const simErr = requireFields(body, ['winner_id', 'score_team1', 'score_team2'])
    if (simErr) return simErr
    const { winner_id, score_team1, score_team2 } = body

    const { error } = await supabase
      .from('tournament_matches')
      .update({
        winner_id,
        score_team1,
        score_team2,
        map: null,
        status: 'awaiting_confirmation',
        confirmed: false,
        updated_at: new Date().toISOString(),
      })
      .eq('id', params.matchId)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  }

  // All other actions require a valid session
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const isSuperUser = session.user.isSuperUser
  const isOrganizer = session.user.isOrganizer
  const isCaptain = session.user.isCaptain
  const actorId = session.user.userId
  const actorName = session.user.name ?? 'unknown'

  const { data: match } = await supabase
    .from('tournament_matches')
    .select('*, team1:teams!team1_id(name, captain_id), team2:teams!team2_id(name, captain_id), winner:teams!winner_id(name)')
    .eq('id', params.matchId)
    .maybeSingle()

  const matchLabel = `${(match?.team1 as any)?.name ?? '?'} vs ${(match?.team2 as any)?.name ?? '?'}`

  // A captain may only confirm/reject a match involving their OWN team — not any match
  // globally. Organizers and superusers keep blanket rights. (§3.4 / R6.5)
  const isMatchCaptain =
    isCaptain &&
    ((match?.team1 as any)?.captain_id === actorId ||
      (match?.team2 as any)?.captain_id === actorId)
  const canConfirm = isSuperUser || isOrganizer || isMatchCaptain

  if (action === 'confirm') {
    if (!canConfirm) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    // Refuse to confirm a match with no winner. KTPBridge writes scores but no winner_id
    // (§3.1); derive the winner from scores here, or reject if scores are missing/tied.
    let effectiveWinnerId = (match?.winner_id as string | null) ?? null
    if (!effectiveWinnerId) {
      const s1 = match?.score_team1
      const s2 = match?.score_team2
      if (s1 == null || s2 == null || s1 === s2) {
        return NextResponse.json(
          { error: 'Cannot confirm: match has no winner and scores are missing or tied' },
          { status: 400 }
        )
      }
      effectiveWinnerId = s1 > s2 ? match.team1_id : match.team2_id
    }

    // Status guard makes confirm idempotent: only an awaiting_confirmation match can be
    // confirmed. A second confirm (or confirm of a non-reported match) matches 0 rows →
    // 409, so the winner can never be advanced into the next match twice (§2.2).
    const { data: confirmed, error } = await supabase
      .from('tournament_matches')
      .update({
        status: 'complete',
        confirmed: true,
        confirmed_by: actorId,
        confirmed_at: new Date().toISOString(),
        winner_id: effectiveWinnerId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', params.matchId)
      .eq('status', 'awaiting_confirmation')
      .select('id')

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!confirmed || confirmed.length === 0) {
      return NextResponse.json(
        { error: 'Match is not awaiting confirmation (already confirmed or not yet reported)' },
        { status: 409 }
      )
    }

    // Recalculate standings if group stage
    if (match?.group_id) {
      await recalcStandings(supabase, params.id, match.group_id)
    }

    // Advance bracket using the effective (possibly derived) winner
    await advanceBracket(supabase, { ...match, winner_id: effectiveWinnerId }, params.id)

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

    // Un-advance: if this match had already fed its winner into the next match, clear that
    // deterministic slot — but only if the slot still holds the rejected winner AND the
    // downstream match hasn't started yet. Closes the reject-after-advance hole (§2.2).
    if (match?.next_match_id && match?.winner_id && match?.match_number != null) {
      const slot = match.match_number % 2 === 1 ? 'team1_id' : 'team2_id'
      await supabase
        .from('tournament_matches')
        .update({ [slot]: null, updated_at: new Date().toISOString() })
        .eq('id', match.next_match_id)
        .eq('status', 'pending')
        .eq(slot, match.winner_id)
    }

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

    const editErr = requireFields(body, ['winner_id', 'score_team1', 'score_team2'])
    if (editErr) return editErr
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
    const winnerScore = m.winner_id === m.team1_id ? (m.score_team1 ?? 0) : (m.score_team2 ?? 0)
    const loserScore  = m.winner_id === m.team1_id ? (m.score_team2 ?? 0) : (m.score_team1 ?? 0)
    if (stats[m.winner_id]) {
      stats[m.winner_id].wins++
      stats[m.winner_id].pf += winnerScore
      stats[m.winner_id].pa += loserScore
    }
    if (stats[loserId]) {
      stats[loserId].losses++
      stats[loserId].pf += loserScore
      stats[loserId].pa += winnerScore
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

async function advanceBracket(supabase: any, match: any, _tournamentId: string) {
  if (!match?.next_match_id || !match?.winner_id) return
  // Deterministic slot: a feeder's match_number parity fixes which slot it occupies in the
  // next match (odd → team1, even → team2): QF1/QF3 → their SF's team1, QF2/QF4 → team2;
  // SF1 → final.team1, SF2 → final.team2. Re-advancing therefore REPLACES the same slot
  // instead of filling "first empty", so double-confirm/edit can't put a team in both
  // slots or clobber the other feeder's winner (§2.2).
  if (match.match_number == null) {
    console.warn(
      '[advanceBracket] match', match.id,
      'has next_match_id but null match_number; skipping advance to avoid mis-slotting'
    )
    return
  }
  const slot = match.match_number % 2 === 1 ? 'team1_id' : 'team2_id'
  await supabase
    .from('tournament_matches')
    .update({ [slot]: match.winner_id, updated_at: new Date().toISOString() })
    .eq('id', match.next_match_id)
}
