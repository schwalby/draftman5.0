import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabase'

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string; matchId: string } }
) {
  const { id: tournamentId, matchId } = params

  const session = await getServerSession(authOptions)
  const isAdmin = session?.user?.isOrganizer || (session?.user as any)?.isSuperUser
  const isCaptain = (session?.user as any)?.isCaptain
  const botSecret = req.headers.get('x-bot-secret')
  const validBot = botSecret === process.env.BOT_SECRET

  if (!isAdmin && !isCaptain && !validBot) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const { winner_id, score_team1, score_team2, map, ktp_match_id, action, note } = body

  const { data: match, error: mErr } = await getSupabaseAdmin()
    .from('tournament_matches')
    .select('*')
    .eq('id', matchId)
    .eq('tournament_id', tournamentId)
    .single()
  if (mErr || !match) return NextResponse.json({ error: 'Match not found' }, { status: 404 })

  // BOT REPORTS → awaiting_confirmation
  if (action === 'report' || validBot) {
    const { data: updated, error } = await getSupabaseAdmin()
      .from('tournament_matches')
      .update({
        winner_id, score_team1, score_team2,
        map: map ?? match.map,
        ktp_match_id: ktp_match_id ?? match.ktp_match_id,
        status: 'awaiting_confirmation',
        confirmed: false, confirmed_by: null, confirmed_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', matchId).select().single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    await logEdit(matchId, null, 'bot', match, { winner_id, score_team1, score_team2 }, 'Bot reported — awaiting confirmation')
    return NextResponse.json(updated)
  }

  // CONFIRM → complete + recalculate
  if (action === 'confirm') {
    if (!isAdmin && !isCaptain) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    const userId = (session?.user as any)?.userId ?? null
    const { data: updated, error } = await getSupabaseAdmin()
      .from('tournament_matches')
      .update({
        status: 'complete', confirmed: true,
        confirmed_by: userId, confirmed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', matchId).select().single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    await logEdit(matchId, userId, 'admin', match, { winner_id: match.winner_id, score_team1: match.score_team1, score_team2: match.score_team2 }, 'Confirmed')
    if (match.stage === 'group' && match.group_id) await recalculateStandings(tournamentId, match.group_id)
    if (match.next_match_id && match.winner_id) await advanceWinner(match.next_match_id, match.winner_id)
    return NextResponse.json(updated)
  }

  // REJECT → reset to pending
  if (action === 'reject') {
    if (!isAdmin && !isCaptain) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    const userId = (session?.user as any)?.userId ?? null
    const { data: updated, error } = await getSupabaseAdmin()
      .from('tournament_matches')
      .update({
        status: 'pending', winner_id: null, score_team1: null, score_team2: null,
        confirmed: false, confirmed_by: null, confirmed_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', matchId).select().single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    await logEdit(matchId, userId, 'admin', match, { winner_id: null, score_team1: null, score_team2: null }, note ?? 'Rejected — reset to pending')
    if (match.stage === 'group' && match.group_id) await recalculateStandings(tournamentId, match.group_id)
    return NextResponse.json(updated)
  }

  // ADMIN MANUAL EDIT → complete immediately (no confirmation needed)
  if (action === 'edit') {
    if (!isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    const userId = (session?.user as any)?.userId ?? null
    const { data: updated, error } = await getSupabaseAdmin()
      .from('tournament_matches')
      .update({
        winner_id, score_team1, score_team2,
        map: map ?? match.map,
        status: 'complete', confirmed: true,
        confirmed_by: userId, confirmed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', matchId).select().single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    await logEdit(matchId, userId, 'admin', match, { winner_id, score_team1, score_team2 }, note ?? 'Manual admin override')
    if (match.stage === 'group' && match.group_id) await recalculateStandings(tournamentId, match.group_id)
    if (match.next_match_id && winner_id) await advanceWinner(match.next_match_id, winner_id)
    return NextResponse.json(updated)
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
}

async function logEdit(
  matchId: string, editedBy: string | null, source: string,
  prev: any, next: any, note: string
) {
  await getSupabaseAdmin().from('tournament_match_edits').insert({
    match_id: matchId, edited_by: editedBy, source,
    prev_winner_id: prev.winner_id, prev_score_team1: prev.score_team1, prev_score_team2: prev.score_team2,
    new_winner_id: next.winner_id, new_score_team1: next.score_team1, new_score_team2: next.score_team2,
    note,
  })
}

async function recalculateStandings(tournamentId: string, groupId: string) {
  console.log(`[standings] recalculating — tournament=${tournamentId} group=${groupId}`)

  const { data: matches, error: matchErr } = await getSupabaseAdmin()
    .from('tournament_matches')
    .select('*')
    .eq('group_id', groupId)
    .eq('status', 'complete')

  if (matchErr) {
    console.error('[standings] error fetching matches:', matchErr.message)
    return
  }
  console.log(`[standings] found ${matches?.length ?? 0} complete matches`)

  const { data: groupTeams, error: teamErr } = await getSupabaseAdmin()
    .from('tournament_group_teams')
    .select('team_id')
    .eq('group_id', groupId)

  if (teamErr) {
    console.error('[standings] error fetching group teams:', teamErr.message)
    return
  }
  console.log(`[standings] found ${groupTeams?.length ?? 0} teams in group`)

  if (!matches || !groupTeams) {
    console.error('[standings] missing matches or groupTeams — aborting')
    return
  }

  const standings: Record<string, { wins: number; losses: number; points_for: number; points_against: number }> = {}
  for (const { team_id } of groupTeams) {
    standings[team_id] = { wins: 0, losses: 0, points_for: 0, points_against: 0 }
  }

  for (const m of matches) {
    if (!m.team1_id || !m.team2_id || !m.winner_id) {
      console.log(`[standings] skipping match ${m.id} — missing team or winner`)
      continue
    }
    const loserId = m.winner_id === m.team1_id ? m.team2_id : m.team1_id
    if (standings[m.winner_id]) {
      standings[m.winner_id].wins++
      standings[m.winner_id].points_for += m.winner_id === m.team1_id ? (m.score_team1 ?? 0) : (m.score_team2 ?? 0)
      standings[m.winner_id].points_against += m.winner_id === m.team1_id ? (m.score_team2 ?? 0) : (m.score_team1 ?? 0)
    } else {
      console.log(`[standings] winner ${m.winner_id} not found in group standings`)
    }
    if (standings[loserId]) {
      standings[loserId].losses++
      standings[loserId].points_for += loserId === m.team1_id ? (m.score_team1 ?? 0) : (m.score_team2 ?? 0)
      standings[loserId].points_against += loserId === m.team1_id ? (m.score_team2 ?? 0) : (m.score_team1 ?? 0)
    } else {
      console.log(`[standings] loser ${loserId} not found in group standings`)
    }
  }

  console.log('[standings] computed:', JSON.stringify(standings))

  const sorted = Object.entries(standings).sort(([, a], [, b]) => {
    const wDiff = b.wins - a.wins
    if (wDiff !== 0) return wDiff
    return (b.points_for - b.points_against) - (a.points_for - a.points_against)
  })

  for (let i = 0; i < sorted.length; i++) {
    const [team_id, s] = sorted[i]
    const { error: updateErr } = await getSupabaseAdmin()
      .from('tournament_standings')
      .update({ ...s, seed: i + 1, updated_at: new Date().toISOString() })
      .eq('tournament_id', tournamentId)
      .eq('group_id', groupId)
      .eq('team_id', team_id)
    if (updateErr) {
      console.error(`[standings] failed to update team ${team_id}:`, updateErr.message)
    } else {
      console.log(`[standings] updated team ${team_id} seed=${i + 1} wins=${s.wins} losses=${s.losses}`)
    }
  }

  console.log('[standings] recalculation complete')
}

async function advanceWinner(nextMatchId: string, winnerId: string) {
  const { data: nextMatch } = await getSupabaseAdmin()
    .from('tournament_matches')
    .select('team1_id, team2_id')
    .eq('id', nextMatchId)
    .single()
  if (!nextMatch) return
  const slot = !nextMatch.team1_id ? 'team1_id' : 'team2_id'
  await getSupabaseAdmin()
    .from('tournament_matches')
    .update({ [slot]: winnerId, updated_at: new Date().toISOString() })
    .eq('id', nextMatchId)
}
