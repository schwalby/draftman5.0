import { Embed, Message } from 'discord.js'
import { supabase } from '../core/supabase'

// ── ParsedKTP ─────────────────────────────────────────────────────────────────
export interface ParsedKTP {
  alliesPlayers: string[]
  axisPlayers:   string[]
  alliesScore:   number
  axisScore:     number
  winningSide:   'allies' | 'axis' | null
  map:           string | null
  ktpMatchId:    string | null
  is12Man:       boolean
}

// ── Steam ID conversion ───────────────────────────────────────────────────────
// Preserved exactly from index.ts — no logic changes
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

// ── parseKTP ──────────────────────────────────────────────────────────────────
// Preserved exactly from index.ts — no logic changes
export function parseKTP(embed: Embed): ParsedKTP | null {
  const fields = embed.fields ?? []
  const status = fields.find(f => f.name.toLowerCase() === 'status')?.value ?? ''
  if (!status.includes('MATCH COMPLETE')) return null

  const winMatch   = status.match(/(Allies|Axis) wins!/i)
  const scoreMatch = status.match(/Final:\s*(\d+)-(\d+)/i)
  const footer     = embed.footer?.text ?? ''
  const mapMatch   = footer.match(/Map:\s*([^\s|]+)/i)
  const ktpMatch   = footer.match(/Match:\s*([^\s|]+)/i)
  const alliesF    = fields.find(f => /allies/i.test(f.name))
  const axisF      = fields.find(f => /axis/i.test(f.name))

  return {
    alliesPlayers: alliesF ? extractSteamIds(alliesF.value) : [],
    axisPlayers:   axisF   ? extractSteamIds(axisF.value)   : [],
    alliesScore:   scoreMatch ? parseInt(scoreMatch[1]) : 0,
    axisScore:     scoreMatch ? parseInt(scoreMatch[2]) : 0,
    winningSide:   winMatch ? (winMatch[1].toLowerCase() as 'allies' | 'axis') : null,
    map:           mapMatch ? mapMatch[1] : null,
    ktpMatchId:    ktpMatch ? ktpMatch[1] : null,
    is12Man:       footer.includes('12MAN'),
  }
}

// ── processKTPMessage ─────────────────────────────────────────────────────────
// Decoupled from result/match state — emits via callbacks
// on12ManResult: called when is12Man is true
// onDraftResult: called when is12Man is false
export async function processKTPMessage(
  message: Message,
  resultsChannelId: string,
  on12ManResult: (parsed: ParsedKTP) => Promise<void>,
  onDraftResult: (parsed: ParsedKTP) => Promise<void>,
): Promise<void> {
  if (message.channelId !== resultsChannelId || !message.author.bot || !message.embeds.length) return
  for (const embed of message.embeds) {
    const parsed = parseKTP(embed)
    if (!parsed) continue
    console.log(`[bot] KTP result: ${parsed.winningSide} wins ${parsed.alliesScore}-${parsed.axisScore} | 12MAN: ${parsed.is12Man}`)
    if (parsed.is12Man) {
      await on12ManResult(parsed)
    } else {
      await onDraftResult(parsed)
    }
  }
}

// ── processDraftResult ────────────────────────────────────────────────────────
// Preserved exactly from index.ts — no logic changes
export async function processDraftResult(
  parsed: ParsedKTP,
  matchThreshold: number,
  apiBaseUrl: string,
  botSecret: string,
  guildId: string,
): Promise<void> {
  const ids = [...parsed.alliesPlayers, ...parsed.axisPlayers]
  if (!ids.length) return

  const { data: users } = await supabase.from('users').select('id, steam_id_64').in('steam_id_64', ids)
  if (!users?.length) return
  const userIds = users.map((u: any) => u.id)

  const { data: tp } = await supabase
    .from('team_players')
    .select('user_id, team_id, side, teams(id, name, event_id)')
    .in('user_id', userIds)
  if (!tp?.length) return

  const overlap: Record<string, { count: number; eventId: string }> = {}
  for (const t of tp) {
    const eid = (t.teams as any)?.event_id
    if (!eid) continue
    if (!overlap[eid]) overlap[eid] = { count: 0, eventId: eid }
    overlap[eid].count++
  }
  const best = Object.values(overlap).sort((a, b) => b.count - a.count)[0]
  if (!best || best.count < matchThreshold) return

  const { data: tourney } = await supabase
    .from('tournaments')
    .select('id')
    .eq('event_id', best.eventId)
    .neq('status', 'complete')
    .maybeSingle()
  if (!tourney) return

  const { data: matches } = await supabase
    .from('tournament_matches')
    .select('id, team1_id, team2_id')
    .eq('tournament_id', tourney.id)
    .in('status', ['pending', 'awaiting_confirmation'])
  if (!matches?.length) return

  const teamIds = new Set(
    tp.filter((t: any) => (t.teams as any)?.event_id === best.eventId).map((t: any) => t.team_id)
  )
  const match = matches.find((m: any) => teamIds.has(m.team1_id) || teamIds.has(m.team2_id))
  if (!match) return

  const alliesTeam = tp.filter((t: any) => t.side === 'allies' && (t.teams as any)?.event_id === best.eventId).map((t: any) => t.team_id)[0]
  const axisTeam   = tp.filter((t: any) => t.side === 'axis'   && (t.teams as any)?.event_id === best.eventId).map((t: any) => t.team_id)[0]
  const winnerId   = parsed.winningSide === 'allies' ? alliesTeam : axisTeam

  await fetch(`${apiBaseUrl}/api/tournaments/${tourney.id}/matches/${(match as any).id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', 'x-bot-secret': botSecret },
    body: JSON.stringify({
      action: 'report',
      winner_id: winnerId,
      score_team1: parsed.alliesScore,
      score_team2: parsed.axisScore,
      map: parsed.map,
      ktp_match_id: parsed.ktpMatchId,
    }),
  })
    .then(r => r.ok
      ? console.log(`[bot] Reported draft match ${(match as any).id}`)
      : console.error('[bot] Report failed:', r.status))
    .catch(err => console.error('[bot] Report error:', err))
}
