import 'dotenv/config'
import {
  Client,
  GatewayIntentBits,
  Message,
  Embed,
  REST,
  Routes,
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  ButtonInteraction,
} from 'discord.js'
import { createClient } from '@supabase/supabase-js'
import ws from 'ws'

// ── Env validation ────────────────────────────────────────────────────────────
const REQUIRED_ENV = [
  'DISCORD_BOT_TOKEN',
  'DISCORD_CLIENT_ID',
  'DISCORD_GUILD_ID',
  'DISCORD_VERIFIED_ROLE_ID',
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
const DISCORD_CLIENT_ID     = process.env.DISCORD_CLIENT_ID!
const DISCORD_GUILD_ID      = process.env.DISCORD_GUILD_ID!
const BOT_SECRET            = process.env.BOT_SECRET!
const SUPABASE_URL          = process.env.SUPABASE_URL!
const SUPABASE_KEY          = process.env.SUPABASE_SERVICE_ROLE_KEY!
const API_BASE_URL          = process.env.API_BASE_URL!
const RESULTS_CHANNEL_ID    = process.env.RESULTS_CHANNEL_ID!
const MATCH_THRESHOLD       = 8

// ── Supabase ──────────────────────────────────────────────────────────────────
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  realtime: { transport: ws as any },
})

// ── Slash command definitions ─────────────────────────────────────────────────
const commands = [
  new SlashCommandBuilder()
    .setName('verify')
    .setDescription('Link your Steam account to participate in drafts')
    .toJSON(),
]

// ── Register slash commands ───────────────────────────────────────────────────
async function registerCommands() {
  const rest = new REST({ version: '10' }).setToken(DISCORD_BOT_TOKEN)
  try {
    console.log('[bot] Registering slash commands...')
    await rest.put(
      Routes.applicationGuildCommands(DISCORD_CLIENT_ID, DISCORD_GUILD_ID),
      { body: commands }
    )
    console.log('[bot] Slash commands registered.')
  } catch (err) {
    console.error('[bot] Failed to register slash commands:', err)
  }
}

// ── Helper: check if user exists in DB ───────────────────────────────────────
async function getUserRecord(discordId: string) {
  const { data } = await supabase
    .from('users')
    .select('id, steam_verified, steam_name, steam_id')
    .eq('discord_id', discordId)
    .maybeSingle()
  return data
}

// ── Helper: send Steam verify link ───────────────────────────────────────────
async function sendVerifyLink(
  interaction: ChatInputCommandInteraction | ButtonInteraction,
  discordId: string,
  discordUsername: string,
  isFollowUp = false
) {
  const res = await fetch(`${API_BASE_URL}/api/verify/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-bot-secret': BOT_SECRET,
    },
    body: JSON.stringify({ discord_id: discordId, discord_username: discordUsername }),
  })

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}))

    if (res.status === 429) {
      const msg = '⏳ Too many verification attempts. Please wait 10 minutes and try again.'
      if (isFollowUp) {
        await (interaction as ButtonInteraction).followUp({ content: msg, flags: 64 })
      } else {
        await interaction.editReply({ content: msg })
      }
      return
    }

    console.error('[bot] /verify token request failed:', res.status, errData)
    const msg = '❌ Something went wrong generating your verification link. Please try again.'
    if (isFollowUp) {
      await (interaction as ButtonInteraction).followUp({ content: msg, flags: 64 })
    } else {
      await interaction.editReply({ content: msg })
    }
    return
  }

  const data = await res.json() as {
    already_verified?: boolean
    steam_name?: string
    url?: string
  }

  if (data.already_verified) {
    const msg = `✅ You're already verified! Your Steam account **${data.steam_name ?? ''}** is linked.`
    if (isFollowUp) {
      await (interaction as ButtonInteraction).followUp({ content: msg, flags: 64 })
    } else {
      await interaction.editReply({ content: msg })
    }
    return
  }

  const content = [
    `**DRAFT MAN 5.0 — Steam Verification**`,
    ``,
    `Click the link below to link your Steam account. The link expires in **15 minutes**.`,
    ``,
    `🔗 ${data.url}`,
    ``,
    `Your Steam profile must be **public** during verification. You can set it back to private once done.`,
  ].join('\n')

  if (isFollowUp) {
    await (interaction as ButtonInteraction).followUp({ content, flags: 64 })
  } else {
    await interaction.editReply({ content })
  }
}

// ── /verify handler ───────────────────────────────────────────────────────────
async function handleVerify(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ flags: 64 })

  const discordId       = interaction.user.id
  const discordUsername = interaction.user.username

  try {
    const user = await getUserRecord(discordId)
    console.log(`[bot] /verify — discord_id: ${discordId}, user found: ${!!user}`)

    if (!user) {
      const loginBtn = new ButtonBuilder()
        .setCustomId(`verify_loggedin_${discordId}`)
        .setLabel("✓  I'm signed in — send me the link")
        .setStyle(ButtonStyle.Success)

      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(loginBtn)

      await interaction.editReply({
        content: [
          `**You need to create a DRAFTMAN5.0 account first.**`,
          ``,
          `Click the link below to sign in with Discord. It will log you in automatically — no extra steps.`,
          ``,
          `🔗 ${API_BASE_URL}/api/auth/signin/discord`,
          ``,
          `Once you're signed in, come back and click the button below.`,
        ].join('\n'),
        components: [row],
      })
      return
    }

    await sendVerifyLink(interaction, discordId, discordUsername)

  } catch (err) {
    console.error('[bot] /verify error:', err)
    await interaction.editReply({
      content: '❌ An unexpected error occurred. Please try again or contact a moderator.',
    })
  }
}

// ── Button: "I'm signed in" ───────────────────────────────────────────────────
async function handleVerifyLoggedIn(interaction: ButtonInteraction) {
  await interaction.deferUpdate()

  const discordId       = interaction.user.id
  const discordUsername = interaction.user.username

  try {
    const user = await getUserRecord(discordId)
    console.log(`[bot] verify_loggedin — discord_id: ${discordId}, user found: ${!!user}`)

    if (!user) {
      await interaction.followUp({
        content: [
          `❌ We still can't find your account. Make sure you clicked the sign-in link and completed the Discord login at:`,
          ``,
          `🔗 ${API_BASE_URL}/api/auth/signin/discord`,
          ``,
          `Once you're signed in, click the button again.`,
        ].join('\n'),
        flags: 64,
      })
      return
    }

    await sendVerifyLink(interaction, discordId, discordUsername, true)

  } catch (err) {
    console.error('[bot] verify_loggedin error:', err)
    await interaction.followUp({
      content: '❌ An unexpected error occurred. Please try again or contact a moderator.',
      flags: 64,
    })
  }
}

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
  alliesPlayers: string[]
  axisPlayers: string[]
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
  const fields = embed.fields ?? []
  const statusField = fields.find(f => f.name.toLowerCase() === 'status')

  if (!statusField) return null

  const statusText = statusField.value
  const complete = statusText.includes('MATCH COMPLETE')
  if (!complete) return null

  const winnerMatch = statusText.match(/(Allies|Axis) wins!/i)
  const winningSide = winnerMatch
    ? (winnerMatch[1].toLowerCase() as 'allies' | 'axis')
    : null

  const scoreMatch = statusText.match(/Final:\s*(\d+)-(\d+)/i)
  const alliesScore = scoreMatch ? parseInt(scoreMatch[1]) : 0
  const axisScore   = scoreMatch ? parseInt(scoreMatch[2]) : 0

  const footer = embed.footer?.text ?? ''
  const mapMatch    = footer.match(/Map:\s*([^\s|]+)/i)
  const ktpIdMatch  = footer.match(/Match:\s*([^\s|]+)/i)
  const map         = mapMatch   ? mapMatch[1]   : null
  const ktpMatchId  = ktpIdMatch ? ktpIdMatch[1] : null

  const alliesField = fields.find(f => /allies/i.test(f.name))
  const axisField   = fields.find(f => /axis/i.test(f.name))

  const alliesPlayers = alliesField ? parseSteamIds(alliesField.value) : []
  const axisPlayers   = axisField   ? parseSteamIds(axisField.value)   : []

  if (alliesPlayers.length === 0 && axisPlayers.length === 0 && description) {
    const all = parseSteamIds(description)
    return {
      date: title, alliesPlayers: all, axisPlayers: [],
      alliesScore, axisScore, winningSide, map, ktpMatchId,
      complete,
    } as any
  }

  return { date: title, alliesPlayers, axisPlayers, alliesScore, axisScore, winningSide, map, ktpMatchId, complete }
}

// ── Roster matcher ────────────────────────────────────────────────────────────
async function findMatch(parsed: ParsedEmbed): Promise<MatchResult | null> {
  const allSteamId64s = [...parsed.alliesPlayers, ...parsed.axisPlayers]
  if (allSteamId64s.length === 0) {
    console.log('[bot] No Steam IDs found in embed')
    return null
  }

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

  const { data: teamPlayers, error: tpErr } = await supabase
    .from('team_players')
    .select('user_id, team_id, side, teams(id, name, event_id)')
    .in('user_id', userIds)

  if (tpErr || !teamPlayers || teamPlayers.length === 0) {
    console.log('[bot] No drafted players found for matched users')
    return null
  }

  const eventOverlap: Record<string, { count: number; eventId: string }> = {}
  for (const tp of teamPlayers) {
    const eventId = (tp.teams as any)?.event_id
    if (!eventId) continue
    if (!eventOverlap[eventId]) eventOverlap[eventId] = { count: 0, eventId }
    eventOverlap[eventId].count++
  }

  const best = Object.values(eventOverlap).sort((a, b) => b.count - a.count)[0]
  if (!best || best.count < MATCH_THRESHOLD) {
    console.log(`[bot] Best overlap ${best?.count ?? 0} is below threshold ${MATCH_THRESHOLD}`)
    return null
  }

  console.log(`[bot] Confident match — event ${best.eventId} with ${best.count} player overlaps`)

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

  const { data: matches } = await supabase
    .from('tournament_matches')
    .select('id, team1_id, team2_id, status')
    .eq('tournament_id', tournament.id)
    .in('status', ['pending', 'awaiting_confirmation'])

  if (!matches || matches.length === 0) {
    console.log('[bot] No pending matches found in tournament', tournament.id)
    return null
  }

  const matchedTeamIds = Array.from(new Set(teamPlayers
    .filter(tp => (tp.teams as any)?.event_id === best.eventId)
    .map(tp => tp.team_id)
  ))

  const targetMatch = matches.find(m =>
    matchedTeamIds.includes(m.team1_id) || matchedTeamIds.includes(m.team2_id)
  )

  if (!targetMatch) {
    console.log('[bot] Could not identify specific match from team IDs')
    return null
  }

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
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
  ],
})

client.once('clientReady', async () => {
  console.log(`[bot] DRAFT_MAN5.0 online as ${client.user?.tag}`)
  console.log(`[bot] Watching channel: ${RESULTS_CHANNEL_ID}`)
  await registerCommands()
})

// ── Interactions ──────────────────────────────────────────────────────────────
client.on('interactionCreate', async (interaction) => {
  if (interaction.isChatInputCommand()) {
    if (interaction.commandName === 'verify') {
      await handleVerify(interaction)
    }
    return
  }

  if (interaction.isButton()) {
    if (interaction.customId.startsWith('verify_loggedin_')) {
      await handleVerifyLoggedIn(interaction)
    }
    return
  }
})

// ── KTP match reporting ───────────────────────────────────────────────────────
client.on('messageCreate', async (message: Message) => {
  if (message.channelId !== RESULTS_CHANNEL_ID) return
  if (!message.author.bot) return
  if (!message.embeds || message.embeds.length === 0) return

  console.log(`[bot] Received embed from ${message.author.tag} in results channel`)

  for (const embed of message.embeds) {
    const parsed = parseKTPEmbed(embed)
    if (!parsed) {
      console.log('[bot] Embed not a complete match result, skipping')
      continue
    }

    console.log(`[bot] Parsed complete match — ${parsed.winningSide} wins ${parsed.alliesScore}-${parsed.axisScore} on ${parsed.map}`)

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

client.on('messageUpdate', async (oldMessage, newMessage) => {
  if (newMessage.channelId !== RESULTS_CHANNEL_ID) return
  if (!newMessage.author?.bot) return
  if (!newMessage.embeds || newMessage.embeds.length === 0) return

  const message = newMessage.partial ? await newMessage.fetch() : newMessage

  console.log(`[bot] Received embed UPDATE from ${message.author.tag}`)

  for (const embed of message.embeds) {
    const parsed = parseKTPEmbed(embed)
    if (!parsed) continue

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
