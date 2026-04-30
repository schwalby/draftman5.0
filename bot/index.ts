import 'dotenv/config'
import { Client, GatewayIntentBits, Message, Embed } from 'discord.js'
import { createClient } from '@supabase/supabase-js'

// ── Env validation ────────────────────────────────────────────────────────────
const REQUIRED_ENV = [
  'DISCORD_BOT_TOKEN',
  'BOT_SECRET',
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'API_BASE_URL',
  'RESULTS_CHANNEL_ID',
]
for (const key of REQUIRED_ENV) {
  if (!process.env[key]) {
    console.error(`[bot] Missing required env var: ${key}`)
    process.exit(1)
  }
}

const DISCORD_BOT_TOKEN     = process.env.DISCORD_BOT_TOKEN!
const BOT_SECRET            = process.env.BOT_SECRET!
const SUPABASE_URL          = process.env.SUPABASE_URL!
const SUPABASE_KEY          = process.env.SUPABASE_SERVICE_ROLE_KEY!
const API_BASE_URL          = process.env.API_BASE_URL!
const RESULTS_CHANNEL_ID    = process.env.RESULTS_CHANNEL_ID!
const MATCH_THRESHOLD       = 8 // minimum Steam ID matches to consider a confident roster match

// ── Supabase ──────────────────────────────────────────────────────────────────
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

// ── Types ─────────────────────────────────────────────────────────────────────
interface DraftedPlayer {
  user_id: string
  steam_id: string | null
  steam_id_64: string | null
  team_id: string
  team_name: string
  side: 'allies' | 'axis'
}

interface MatchResult {
  tournamentId: string
  matchId: string
  winningSide: 'allies' | 'axis'
  score: string
  map: string | null
  ktpMatchId: string | null
  alliesScore: number
  axisScore: number
}

// ── Steam ID conversion ───────────────────────────────────────────────────────
const STEAM_ID64_BASE = BigInt('76561197960265728')

function toSteamId64(input: string): string | null {
  const trimmed = input.trim()
  if (/^\d{17}$/.test(trimmed) && trimmed.startsWith('7656119')) return trimmed
  const match = trimmed.match(/^STEAM_0:([01]):(\d+)$/i)
  if (match) {
    const y = BigInt(match[1])
    const z = BigInt(match[2])
    return (STEAM_ID64_BASE + z * BigInt(2) + y).toString()
  }
  return null
}

// ── Embed parser ──────────────────────────────────────────────────────────────
interface ParsedEmbed {
  date: string | null
  alliesPlayers: string[]   // Steam IDs
  axisPlayers: string[]     // Steam IDs
  alliesScore: number
  axisScore: number
  winningSide: 'allies' | 'axis' | null
  map: string | null
  ktpMatchId: string | null
  complete: boolean
}

function parseSteamIds(text: string): string[] {
  const ids: string[] = []
  const regex = /STEAM_0:[01]:\d+/gi
  let match
  while ((match = regex.exec(text)) !== null) {
    const id64 = toSteamId64(match[0])
    if (id64) ids.push(id64)
  }
  return ids
}

function parseKTPEmbed(embed: Embed): ParsedEmbed | null {
  const title = embed.title ?? ''
  const description = embed.description ?? ''

  // Only process complete matches
  const fields = embed.fields ?? []
  const statusField = fields.find(f => f.name.toLowerCase() === 'status')
  const scoresField = fields.find(f => f.name.toLowerCase() === 'scores')

  if (!statusField) return null

  const statusText = statusField.value
  const complete = statusText.includes('MATCH COMPLETE')
  if (!complete) return null

  // Parse winner from status: "MATCH COMPLETE - Final: 105-69 - Allies wins!"
  const winnerMatch = statusText.match(/(Allies|Axis) wins!/i)
  const winningSide = winnerMatch
    ? (winnerMatch[1].toLowerCase() as 'allies' | 'axis')
    : null

  // Parse total score from status line: "Final: 105-69"
  const scoreMatch = statusText.match(/Final:\s*(\d+)-(\d+)/i)
  const alliesScore = scoreMatch ? parseInt(scoreMatch[1]) : 0
  const axisScore   = scoreMatch ? parseInt(scoreMatch[2]) : 0
  const score       = scoreMatch ? `${scoreMatch[1]}-${scoreMatch[2]}` : '0-0'

  // Parse map and KTP match ID from footer: "Match: 1234-DAL2 | Map: dod_thunder2 | Server: ..."
  const footer = embed.footer?.text ?? ''
  const mapMatch    = footer.match(/Map:\s*([^\s|]+)/i)
  const ktpIdMatch  = footer.match(/Match:\s*([^\s|]+)/i)
  const map         = mapMatch   ? mapMatch[1]   : null
  const ktpMatchId  = ktpIdMatch ? ktpIdMatch[1] : null

  // Parse player Steam IDs from embed fields (Allies and Axis columns)
  // Fields come as inline pairs — Allies field and Axis field
  const alliesField = fields.find(f => /allies/i.test(f.name))
  const axisField   = fields.find(f => /axis/i.test(f.name))

  const alliesPlayers = alliesField ? parseSteamIds(alliesField.value) : []
  const axisPlayers   = axisField   ? parseSteamIds(axisField.value)   : []

  // Fallback: parse from description if fields are empty
  if (alliesPlayers.length === 0 && axisPlayers.length === 0 && description) {
    // Can't reliably split allies/axis from description, just collect all
    const all = parseSteamIds(description)
    return {
      date: title, alliesPlayers: all, axisPlayers: [],
      alliesScore, axisScore, winningSide, map, ktpMatchId,
      complete, score
    } as any
  }

  return {
    date: title,
    alliesPlayers,
    axisPlayers,
    alliesScore,
    axisScore,
    winningSide,
    map,
    ktpMatchId,
    complete,
  }
}

// ── Roster matcher ────────────────────────────────────────────────────────────
async function findMatch(parsed: ParsedEmbed): Promise<MatchResult | null> {
  const allSteamId64s = [...parsed.alliesPlayers, ...parsed.axisPlayers]
  if (allSteamId64s.length === 0) {
    console.log('[bot] No Steam IDs found in embed')
    return null
  }

  // Look up users by steam_id_64
  const { data: users, error: usersErr } = await supabase
    .from('users')
    .select('id, steam_id_64')
    .in('steam_id_64', allSteamId64s)

  if (usersErr || !users || users.length === 0) {
    console.log('[bot] No users matched Steam IDs:', allSteamId64s)
    return null
  }

  const userIds = users.map(u => u.id)
  console.log(`[bot] Matched ${users.length} users from Steam IDs`)

  // Find active tournament matches where these players are drafted
  // Look through team_players for user_id matches
  const { data: teamPlayers, error: tpErr } = await supabase
    .from('team_players')
    .select('user_id, team_id, side, teams(id, name, event_id)')
    .in('user_id', userIds)

  if (tpErr || !teamPlayers || teamPlayers.length === 0) {
    console.log('[bot] No drafted players found for matched users')
    return null
  }

  // Group by event_id to find which event has the most player overlap
  const eventOverlap: Record<string, { count: number; eventId: string }> = {}
  for (const tp of teamPlayers) {
    const eventId = (tp.teams as any)?.event_id
    if (!eventId) continue
    if (!eventOverlap[eventId]) eventOverlap[eventId] = { count: 0, eventId }
    eventOverlap[eventId].count++
  }

  // Find the event with highest overlap
  const best = Object.values(eventOverlap).sort((a, b) => b.count - a.count)[0]
  if (!best || best.count < MATCH_THRESHOLD) {
    console.log(`[bot] Best overlap ${best?.count ?? 0} is below threshold ${MATCH_THRESHOLD}`)
    return null
  }

  console.log(`[bot] Confident match — event ${best.eventId} with ${best.count} player overlaps`)

  // Find the active tournament for this event
  const { data: tournament } = await supabase
    .from('tournaments')
    .select('id, status')
    .eq('event_id', best.eventId)
    .neq('status', 'complete')
    .maybeSingle()

  if (!tournament) {
    console.log('[bot] No active tournament found for event', best.eventId)
    return null
  }

  // Find the pending match in this tournament
  // Look for a match with status 'pending' or 'awaiting_confirmation'
  const { data: matches } = await supabase
    .from('tournament_matches')
    .select('id, team1_id, team2_id, status')
    .eq('tournament_id', tournament.id)
    .in('status', ['pending', 'awaiting_confirmation'])

  if (!matches || matches.length === 0) {
    console.log('[bot] No pending matches found in tournament', tournament.id)
    return null
  }

  // Find the teams for our players
  const matchedTeamIds = [...new Set(teamPlayers
    .filter(tp => (tp.teams as any)?.event_id === best.eventId)
    .map(tp => tp.team_id)
  )]

  // Find the tournament match that involves these teams
  const targetMatch = matches.find(m =>
    matchedTeamIds.includes(m.team1_id) || matchedTeamIds.includes(m.team2_id)
  )

  if (!targetMatch) {
    console.log('[bot] Could not identify specific match from team IDs')
    return null
  }

  // Determine winner team ID
  // Allies/Axis sides are stored on team_players
  const alliesTeamIds = teamPlayers
    .filter(tp => tp.side === 'allies' && (tp.teams as any)?.event_id === best.eventId)
    .map(tp => tp.team_id)
  const axisTeamIds = teamPlayers
    .filter(tp => tp.side === 'axis' && (tp.teams as any)?.event_id === best.eventId)
    .map(tp => tp.team_id)

  const winningTeamId = parsed.winningSide === 'allies'
    ? (alliesTeamIds[0] ?? null)
    : (axisTeamIds[0] ?? null)

  return {
    tournamentId: tournament.id,
    matchId: targetMatch.id,
    winningSide: parsed.winningSide!,
    score: `${parsed.alliesScore}-${parsed.axisScore}`,
    map: parsed.map,
    ktpMatchId: parsed.ktpMatchId,
    alliesScore: parsed.alliesScore,
    axisScore: parsed.axisScore,
    winnerTeamId: winningTeamId,
  } as any
}

// ── API reporter ──────────────────────────────────────────────────────────────
async function reportMatch(result: MatchResult & { winnerTeamId: string | null }): Promise<boolean> {
  const url = `${API_BASE_URL}/api/tournaments/${result.tournamentId}/matches/${result.matchId}`
  try {
    const res = await fetch(url, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'x-bot-secret': BOT_SECRET,
      },
      body: JSON.stringify({
        action: 'report',
        winner_id: result.winnerTeamId,
        score_team1: result.alliesScore,
        score_team2: result.axisScore,
        map: result.map,
        ktp_match_id: result.ktpMatchId,
      }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      console.error('[bot] API report failed:', res.status, err)
      return false
    }
    console.log('[bot] Match reported successfully:', result.matchId)
    return true
  } catch (err) {
    console.error('[bot] API request error:', err)
    return false
  }
}

// ── Discord client ────────────────────────────────────────────────────────────
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
})

client.once('ready', () => {
  console.log(`[bot] DRAFT_MAN5.0 online as ${client.user?.tag}`)
  console.log(`[bot] Watching channel: ${RESULTS_CHANNEL_ID}`)
})

client.on('messageCreate', async (message: Message) => {
  // Only listen to the results channel
  if (message.channelId !== RESULTS_CHANNEL_ID) return

  // Only process messages from bots (KTP Score Bot)
  if (!message.author.bot) return

  // Must have embeds
  if (!message.embeds || message.embeds.length === 0) return

  console.log(`[bot] Received embed from ${message.author.tag} in results channel`)

  for (const embed of message.embeds) {
    const parsed = parseKTPEmbed(embed)
    if (!parsed) {
      console.log('[bot] Embed not a complete match result, skipping')
      continue
    }

    console.log(`[bot] Parsed complete match — ${parsed.winningSide} wins ${parsed.alliesScore}-${parsed.axisScore} on ${parsed.map}`)
    console.log(`[bot] Allies players: ${parsed.alliesPlayers.length}, Axis players: ${parsed.axisPlayers.length}`)

    const matchResult = await findMatch(parsed)
    if (!matchResult) {
      console.log('[bot] Could not identify tournament match — skipping auto-report')
      continue
    }

    const success = await reportMatch(matchResult as any)
    if (success) {
      console.log(`[bot] ✓ Reported match ${matchResult.matchId} — KTP ID: ${matchResult.ktpMatchId}`)
    }
  }
})

// Also handle message edits — KTP bot edits its embeds when match completes
client.on('messageUpdate', async (oldMessage, newMessage) => {
  if (newMessage.channelId !== RESULTS_CHANNEL_ID) return
  if (!newMessage.author?.bot) return
  if (!newMessage.embeds || newMessage.embeds.length === 0) return

  // Fetch full message if partial
  const message = newMessage.partial ? await newMessage.fetch() : newMessage

  console.log(`[bot] Received embed UPDATE from ${message.author.tag}`)

  for (const embed of message.embeds) {
    const parsed = parseKTPEmbed(embed)
    if (!parsed) continue

    console.log(`[bot] Updated embed is a complete match — processing`)

    const matchResult = await findMatch(parsed)
    if (!matchResult) continue

    await reportMatch(matchResult as any)
  }
})

client.on('error', (err) => {
  console.error('[bot] Discord client error:', err)
})

process.on('unhandledRejection', (err) => {
  console.error('[bot] Unhandled rejection:', err)
})

client.login(DISCORD_BOT_TOKEN)
