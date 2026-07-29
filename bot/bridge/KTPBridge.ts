import { Embed, Message } from 'discord.js'
import { supabase } from '../core/supabase'

// Parses KTP Score Bot result embeds and reports draft-tournament match results
// via the web app's PATCH /api/tournaments/[id]/matches/[matchId] "report" action.
//
// KTP embeds never contain the drafted teams' names — only "Allies"/"Axis" and each
// side's players (name + Steam ID). So the drafted teams playing a given match are
// resolved by mapping each side's Steam IDs -> users -> draft_picks -> team_id, and
// taking whichever team_id has a majority of that side's players.
//
// Every parsed embed (12man or draft) is also logged to ktp_debug_log so parsing can
// be verified against real match traffic even when no draft tournament is live.

interface ParsedKTP {
  alliesSteamIds: string[]
  axisSteamIds: string[]
  scoreAllies: number
  scoreAxis: number
  half1Allies: number | null
  half1Axis: number | null
  half2Allies: number | null
  half2Axis: number | null
  winningSide: 'allies' | 'axis' | null
  map: string | null
  ktpMatchId: string | null
  is12Man: boolean
}

const STEAM64_BASE = BigInt('76561197960265728')

function toSteam64(input: string): string | null {
  const t = input.trim()
  if (/^\d{17}$/.test(t)) return t
  const m = t.match(/^STEAM_0:([01]):(\d+)$/i)
  if (m) return (STEAM64_BASE + BigInt(m[2]) * 2n + BigInt(m[1])).toString()
  return null
}

function extractSteamIds(text: string): string[] {
  const ids: string[] = []
  const re = /STEAM_0:[01]:\d+/gi
  let m
  while ((m = re.exec(text)) !== null) {
    const id = toSteam64(m[0])
    if (id) ids.push(id)
  }
  return ids
}

function parseKTP(embed: Embed): ParsedKTP | null {
  const fields = embed.fields ?? []
  const status = fields.find(f => f.name.toLowerCase() === 'status')?.value ?? ''
  if (!status.includes('MATCH COMPLETE')) return null

  const winMatch   = status.match(/(Allies|Axis) wins!/i)
  const scoreMatch = status.match(/Final:\s*(\d+)-(\d+)/i)
  const footer      = embed.footer?.text ?? ''
  const mapMatch   = footer.match(/Map:\s*([^\s|]+)/i)
  const ktpMatch   = footer.match(/Match:\s*([^\s|]+)/i)
  const alliesF    = fields.find(f => /allies/i.test(f.name))
  const axisF      = fields.find(f => /axis/i.test(f.name))
  const scoresF    = fields.find(f => f.name.toLowerCase() === 'scores')?.value ?? ''
  const half1Match = scoresF.match(/1st Half:\s*Allies\s*(\d+)\s*-\s*(\d+)\s*Axis/i)
  const half2Match = scoresF.match(/2nd Half:\s*(\d+)\s*-\s*(\d+)/i)

  return {
    alliesSteamIds: alliesF ? extractSteamIds(alliesF.value) : [],
    axisSteamIds:   axisF   ? extractSteamIds(axisF.value)   : [],
    scoreAllies:    scoreMatch ? parseInt(scoreMatch[1]) : 0,
    scoreAxis:      scoreMatch ? parseInt(scoreMatch[2]) : 0,
    half1Allies:    half1Match ? parseInt(half1Match[1]) : null,
    half1Axis:      half1Match ? parseInt(half1Match[2]) : null,
    half2Allies:    half2Match ? parseInt(half2Match[1]) : null,
    half2Axis:      half2Match ? parseInt(half2Match[2]) : null,
    winningSide:    winMatch ? (winMatch[1].toLowerCase() as 'allies' | 'axis') : null,
    map:            mapMatch ? mapMatch[1] : null,
    ktpMatchId:     ktpMatch ? ktpMatch[1] : null,
    is12Man:        footer.includes('12MAN'),
  }
}

// Among draft_picks rows for one side's players, the team_id with the most picks wins.
function majorityTeam(picks: { user_id: string; team_id: string }[], sideUserIds: Set<string>): string | null {
  const counts: Record<string, number> = {}
  for (const p of picks) {
    if (!sideUserIds.has(p.user_id)) continue
    counts[p.team_id] = (counts[p.team_id] ?? 0) + 1
  }
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1])
  return sorted.length ? sorted[0][0] : null
}

interface DebugLogRow {
  is_12man: boolean
  winning_side: string | null
  score_allies: number
  score_axis: number
  half1_allies: number | null
  half1_axis: number | null
  half2_allies: number | null
  half2_axis: number | null
  map: string | null
  ktp_match_id: string | null
  allies_steam_ids: string[]
  axis_steam_ids: string[]
  resolved_team_allies: string | null
  resolved_team_axis: string | null
  matched_tournament_match_id: string | null
  report_status: string
  report_detail: string | null
}

async function logDebug(row: DebugLogRow) {
  try {
    const { error } = await supabase.from('ktp_debug_log').insert(row)
    if (error) console.error('[KTPBridge] debug log insert failed:', error)
  } catch (err) {
    console.error('[KTPBridge] debug log insert errored:', err)
  }
}

export async function handleKTPMessage(message: Message) {
  if (message.embeds.length === 0) return

  for (const embed of message.embeds) {
    const parsed = parseKTP(embed)
    if (!parsed) continue // not a MATCH COMPLETE embed at all

    const base: DebugLogRow = {
      is_12man: parsed.is12Man,
      winning_side: parsed.winningSide,
      score_allies: parsed.scoreAllies,
      score_axis: parsed.scoreAxis,
      half1_allies: parsed.half1Allies,
      half1_axis: parsed.half1Axis,
      half2_allies: parsed.half2Allies,
      half2_axis: parsed.half2Axis,
      map: parsed.map,
      ktp_match_id: parsed.ktpMatchId,
      allies_steam_ids: parsed.alliesSteamIds,
      axis_steam_ids: parsed.axisSteamIds,
      resolved_team_allies: null,
      resolved_team_axis: null,
      matched_tournament_match_id: null,
      report_status: 'unknown',
      report_detail: null,
    }

    if (parsed.is12Man) {
      await logDebug({ ...base, report_status: '12man_skipped' })
      continue
    }
    if (!parsed.winningSide) {
      await logDebug({ ...base, report_status: 'no_winner_parsed' })
      continue
    }

    const allSteamIds = [...parsed.alliesSteamIds, ...parsed.axisSteamIds]
    if (!allSteamIds.length) {
      await logDebug({ ...base, report_status: 'no_steam_ids_found' })
      continue
    }

    // Fetch pending matches first so draft_picks can be scoped to teams that are
    // actually in a live match — otherwise a player's picks from unrelated past
    // events could out-vote their current team in majorityTeam().
    const { data: matches, error: matchErr } = await supabase
      .from('tournament_matches')
      .select('id, tournament_id, team1_id, team2_id')
      .eq('status', 'pending')
    if (matchErr) {
      await logDebug({ ...base, report_status: 'error', report_detail: `match lookup: ${matchErr.message}` })
      continue
    }
    if (!matches?.length) {
      await logDebug({ ...base, report_status: 'no_pending_matches' })
      continue
    }

    const candidateTeamIds = [...new Set(matches.flatMap(m => [m.team1_id, m.team2_id]).filter(Boolean))]
    if (!candidateTeamIds.length) {
      await logDebug({ ...base, report_status: 'no_candidate_teams' })
      continue
    }

    const { data: users, error: usersErr } = await supabase
      .from('users')
      .select('id, steam_id_64')
      .in('steam_id_64', allSteamIds)
    if (usersErr) {
      await logDebug({ ...base, report_status: 'error', report_detail: `users lookup: ${usersErr.message}` })
      continue
    }
    if (!users?.length) {
      await logDebug({ ...base, report_status: 'no_users_matched' })
      continue
    }

    const steamToUser = new Map(users.map((u: any) => [u.steam_id_64, u.id as string]))
    const alliesUserIds = new Set(
      parsed.alliesSteamIds.map(id => steamToUser.get(id)).filter((id): id is string => !!id)
    )
    const axisUserIds = new Set(
      parsed.axisSteamIds.map(id => steamToUser.get(id)).filter((id): id is string => !!id)
    )
    if (!alliesUserIds.size || !axisUserIds.size) {
      await logDebug({
        ...base,
        report_status: 'incomplete_side_users',
        report_detail: `allies=${alliesUserIds.size} axis=${axisUserIds.size}`,
      })
      continue
    }

    const { data: picks, error: picksErr } = await supabase
      .from('draft_picks')
      .select('user_id, team_id')
      .in('user_id', [...alliesUserIds, ...axisUserIds])
      .in('team_id', candidateTeamIds)
    if (picksErr) {
      await logDebug({ ...base, report_status: 'error', report_detail: `draft_picks lookup: ${picksErr.message}` })
      continue
    }
    if (!picks?.length) {
      await logDebug({ ...base, report_status: 'no_draft_picks_found' })
      continue
    }

    const teamAllies = majorityTeam(picks, alliesUserIds)
    const teamAxis = majorityTeam(picks, axisUserIds)
    if (!teamAllies || !teamAxis || teamAllies === teamAxis) {
      await logDebug({
        ...base,
        resolved_team_allies: teamAllies,
        resolved_team_axis: teamAxis,
        report_status: 'team_resolution_failed',
      })
      continue
    }

    const match = matches.find(m =>
      (m.team1_id === teamAllies && m.team2_id === teamAxis) ||
      (m.team1_id === teamAxis && m.team2_id === teamAllies)
    )
    if (!match) {
      await logDebug({
        ...base,
        resolved_team_allies: teamAllies,
        resolved_team_axis: teamAxis,
        report_status: 'no_matching_pending_match',
      })
      continue
    }

    const team1IsAllies = match.team1_id === teamAllies
    const winnerId = parsed.winningSide === 'allies' ? teamAllies : teamAxis

    try {
      const res = await fetch(
        `${process.env.API_BASE_URL}/api/tournaments/${match.tournament_id}/matches/${match.id}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', 'x-bot-secret': process.env.BOT_SECRET ?? '' },
          body: JSON.stringify({
            action: 'report',
            winner_id: winnerId,
            score_team1: team1IsAllies ? parsed.scoreAllies : parsed.scoreAxis,
            score_team2: team1IsAllies ? parsed.scoreAxis : parsed.scoreAllies,
            score_half1_team1: team1IsAllies ? parsed.half1Allies : parsed.half1Axis,
            score_half1_team2: team1IsAllies ? parsed.half1Axis : parsed.half1Allies,
            score_half2_team1: team1IsAllies ? parsed.half2Allies : parsed.half2Axis,
            score_half2_team2: team1IsAllies ? parsed.half2Axis : parsed.half2Allies,
            map: parsed.map,
            ktp_match_id: parsed.ktpMatchId,
          }),
        }
      )

      if (res.ok) {
        console.log(`[KTPBridge] Reported result for match ${match.id}: ${parsed.scoreAllies}-${parsed.scoreAxis}`)
        await logDebug({
          ...base,
          resolved_team_allies: teamAllies,
          resolved_team_axis: teamAxis,
          matched_tournament_match_id: match.id,
          report_status: 'reported',
        })
      } else {
        const text = await res.text().catch(() => '')
        console.error(`[KTPBridge] Report failed for match ${match.id}: ${res.status} ${text}`)
        await logDebug({
          ...base,
          resolved_team_allies: teamAllies,
          resolved_team_axis: teamAxis,
          matched_tournament_match_id: match.id,
          report_status: 'report_failed',
          report_detail: `${res.status} ${text}`,
        })
      }
    } catch (err) {
      console.error(`[KTPBridge] Report request errored for match ${match.id}:`, err)
      await logDebug({
        ...base,
        resolved_team_allies: teamAllies,
        resolved_team_axis: teamAxis,
        matched_tournament_match_id: match.id,
        report_status: 'report_error',
        report_detail: String(err),
      })
    }
  }
}
