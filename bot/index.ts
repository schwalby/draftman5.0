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
  EmbedBuilder,
  ChannelType,
  PermissionFlagsBits,
  TextChannel,
  VoiceChannel,
  GuildMember,
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
  'QUEUE_CHANNEL_ID',
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
const DISCORD_VERIFIED_ROLE = process.env.DISCORD_VERIFIED_ROLE_ID!
const BOT_SECRET            = process.env.BOT_SECRET!
const SUPABASE_URL          = process.env.SUPABASE_URL!
const SUPABASE_KEY          = process.env.SUPABASE_SERVICE_ROLE_KEY!
const API_BASE_URL          = process.env.API_BASE_URL!
const RESULTS_CHANNEL_ID    = process.env.RESULTS_CHANNEL_ID!
const QUEUE_CHANNEL_ID      = process.env.QUEUE_CHANNEL_ID!
const MATCH_THRESHOLD       = 8

// ── Supabase ──────────────────────────────────────────────────────────────────
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  realtime: { transport: ws as any },
})

// ── 12man in-memory state ─────────────────────────────────────────────────────
interface QueuePlayer {
  discordId: string
  discordUsername: string
  joinedAt: number
}

interface ActiveMatch {
  matchNumber: number
  textChannelId: string
  gatherVoiceId: string
  teamAVoiceId?: string
  teamBVoiceId?: string
  players: QueuePlayer[]
  waitlist: QueuePlayer[]
  confirmedInVoice: Set<string>
  captainA?: QueuePlayer
  captainB?: QueuePlayer
  teamA: QueuePlayer[]
  teamB: QueuePlayer[]
  voteOrder: string[]
  currentVoteStep: number
  captainVotes: Record<string, string>
  mapVotes: Record<string, string>
  serverVotes: Record<string, string>
  winnerVotes: Record<string, string>
  selectedMap?: string
  selectedServer?: string
  draftPickIndex: number
  draftOrder: number[]
  remainingPlayers: QueuePlayer[]
  activityTimer?: ReturnType<typeof setTimeout>
  voteTimer?: ReturnType<typeof setTimeout>
  timeoutTimers: Map<string, ReturnType<typeof setTimeout>>
  captainVoteMessageId?: string
  mapVoteMessageId?: string
  serverVoteMessageId?: string
  draftMessageId?: string
  winnerVoteMessageId?: string
  dbMatchId?: string
}

let queuePlayers: QueuePlayer[] = []
let queueWaitlist: QueuePlayer[] = []
let queueMessageId: string | null = null
let activeMatch: ActiveMatch | null = null
let matchCounter = 0
let bannedPlayers: Set<string> = new Set()

// ── Config ────────────────────────────────────────────────────────────────────
interface BotConfig {
  queue_size: number
  timeout_minutes: number
  activity_window_minutes: number
  sub_window_minutes: number
  captain_cooldown_games: number
  map_count: number
  vote_threshold: number
  captain_vote_seconds: number
  map_vote_seconds: number
  server_vote_seconds: number
  vote_order: string[]
  draft_pattern: string
  server_locations: string[]
}

const DEFAULT_CONFIG: BotConfig = {
  queue_size: 12,
  timeout_minutes: 90,
  activity_window_minutes: 5,
  sub_window_minutes: 2,
  captain_cooldown_games: 2,
  map_count: 5,
  vote_threshold: 7,
  captain_vote_seconds: 120,
  map_vote_seconds: 90,
  server_vote_seconds: 90,
  vote_order: ['captain', 'map', 'server', 'draft'],
  draft_pattern: '1-2-2-2-2-2-1',
  server_locations: ['Atlanta', 'Chicago', 'Dallas', 'Denver', 'New York'],
}

let botConfig: BotConfig = { ...DEFAULT_CONFIG }

async function loadConfig() {
  const { data } = await supabase
    .from('twelve_man_config')
    .select('*')
    .eq('guild_id', DISCORD_GUILD_ID)
    .maybeSingle()
  if (data) {
    botConfig = {
      queue_size:               data.queue_size               ?? DEFAULT_CONFIG.queue_size,
      timeout_minutes:          data.timeout_minutes          ?? DEFAULT_CONFIG.timeout_minutes,
      activity_window_minutes:  data.activity_window_minutes  ?? DEFAULT_CONFIG.activity_window_minutes,
      sub_window_minutes:       data.sub_window_minutes       ?? DEFAULT_CONFIG.sub_window_minutes,
      captain_cooldown_games:   data.captain_cooldown_games   ?? DEFAULT_CONFIG.captain_cooldown_games,
      map_count:                data.map_count                ?? DEFAULT_CONFIG.map_count,
      vote_threshold:           data.vote_threshold           ?? DEFAULT_CONFIG.vote_threshold,
      captain_vote_seconds:     data.captain_vote_seconds     ?? DEFAULT_CONFIG.captain_vote_seconds,
      map_vote_seconds:         data.map_vote_seconds         ?? DEFAULT_CONFIG.map_vote_seconds,
      server_vote_seconds:      data.server_vote_seconds      ?? DEFAULT_CONFIG.server_vote_seconds,
      vote_order:               data.vote_order               ?? DEFAULT_CONFIG.vote_order,
      draft_pattern:            data.draft_pattern            ?? DEFAULT_CONFIG.draft_pattern,
      server_locations:         data.server_locations         ?? DEFAULT_CONFIG.server_locations,
    }
    console.log('[bot] Config loaded from DB')
  } else {
    console.log('[bot] No config in DB — using defaults')
  }
}

async function getMapPool(): Promise<string[]> {
  const { data } = await supabase
    .from('map_pool')
    .select('map_name')
    .eq('guild_id', DISCORD_GUILD_ID)
    .eq('active', true)
  return data ? data.map((r: any) => r.map_name) : []
}

// ── Slash commands ────────────────────────────────────────────────────────────
const commands = [
  new SlashCommandBuilder()
    .setName('verify')
    .setDescription('Link your Steam account to participate in drafts')
    .toJSON(),
  new SlashCommandBuilder()
    .setName('12man')
    .setDescription('12 man queue commands')
    .addSubcommand(sub => sub.setName('init').setDescription('Post the queue embed in #12man-queue'))
    .addSubcommand(sub => sub.setName('clear').setDescription('Clear the current queue'))
    .addSubcommand(sub => sub.setName('forcestart').setDescription('Force start voting with current players'))
    .addSubcommand(sub => sub.setName('cancel').setDescription('Cancel the active match and re-queue all players'))
    .addSubcommand(sub => sub.setName('config').setDescription('View current config'))
    .addSubcommand(sub =>
      sub.setName('cooldown')
        .setDescription('Manage captain cooldowns')
        .addStringOption(opt =>
          opt.setName('action').setDescription('reset or list').setRequired(true)
            .addChoices({ name: 'reset', value: 'reset' }, { name: 'list', value: 'list' }))
        .addUserOption(opt => opt.setName('player').setDescription('Player to reset cooldown for')))
    .addSubcommand(sub =>
      sub.setName('player')
        .setDescription('Manage players in the queue')
        .addStringOption(opt =>
          opt.setName('action').setDescription('add, remove, ban, unban, or sub').setRequired(true)
            .addChoices(
              { name: 'add', value: 'add' },
              { name: 'remove', value: 'remove' },
              { name: 'ban', value: 'ban' },
              { name: 'unban', value: 'unban' },
              { name: 'sub', value: 'sub' },
            ))
        .addUserOption(opt => opt.setName('player').setDescription('Target player').setRequired(true))
        .addUserOption(opt => opt.setName('replacement').setDescription('Replacement player (for sub only)')))
    .toJSON(),
]

async function registerCommands() {
  const rest = new REST({ version: '10' }).setToken(DISCORD_BOT_TOKEN)
  try {
    console.log('[bot] Registering slash commands...')
    await rest.put(Routes.applicationGuildCommands(DISCORD_CLIENT_ID, DISCORD_GUILD_ID), { body: commands })
    console.log('[bot] Slash commands registered.')
  } catch (err) {
    console.error('[bot] Failed to register slash commands:', err)
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
async function getUserRecord(discordId: string) {
  const { data } = await supabase
    .from('users').select('id, steam_verified, steam_name, steam_id').eq('discord_id', discordId).maybeSingle()
  return data
}

async function isOnCooldown(discordId: string): Promise<boolean> {
  const { data } = await supabase
    .from('twelve_man_captain_cooldowns').select('games_remaining').eq('discord_user_id', discordId).maybeSingle()
  return data ? data.games_remaining > 0 : false
}

async function setCooldown(discordId: string, discordUsername: string) {
  const { data } = await supabase
    .from('twelve_man_captain_cooldowns').select('id').eq('discord_user_id', discordId).maybeSingle()
  if (data) {
    await supabase.from('twelve_man_captain_cooldowns')
      .update({ games_remaining: botConfig.captain_cooldown_games, updated_at: new Date().toISOString() })
      .eq('discord_user_id', discordId)
  } else {
    await supabase.from('twelve_man_captain_cooldowns')
      .insert({ discord_user_id: discordId, discord_username: discordUsername, games_remaining: botConfig.captain_cooldown_games })
  }
}

async function decrementCooldowns(captainAId: string, captainBId: string) {
  for (const id of [captainAId, captainBId]) {
    const { data } = await supabase
      .from('twelve_man_captain_cooldowns').select('games_remaining').eq('discord_user_id', id).maybeSingle()
    const current = data?.games_remaining ?? 0
    if (current > 0) {
      await supabase.from('twelve_man_captain_cooldowns')
        .update({ games_remaining: current - 1, updated_at: new Date().toISOString() }).eq('discord_user_id', id)
    }
  }
}

function buildButtonRows(labels: string[], prefix: string, style: ButtonStyle = ButtonStyle.Secondary): ActionRowBuilder<ButtonBuilder>[] {
  const rows: ActionRowBuilder<ButtonBuilder>[] = []
  let currentRow = new ActionRowBuilder<ButtonBuilder>()
  let count = 0
  for (let i = 0; i < labels.length && i < 25; i++) {
    if (count === 5) { rows.push(currentRow); currentRow = new ActionRowBuilder<ButtonBuilder>(); count = 0 }
    currentRow.addComponents(new ButtonBuilder().setCustomId(`${prefix}_${i}`).setLabel(labels[i]).setStyle(style))
    count++
  }
  if (count > 0) rows.push(currentRow)
  return rows
}

function formatVoteList(labelMap: string[], votes: Record<string, string>): string {
  const counts: Record<string, number> = {}
  for (const v of Object.values(votes)) counts[v] = (counts[v] ?? 0) + 1

  if (labelMap.length <= 5) {
    return labelMap.map((item, i) => `${i + 1}) ${item}   Votes: ${counts[item] ?? 0}`).join('\n')
  }

  const mid = Math.ceil(labelMap.length / 2)
  const left = labelMap.slice(0, mid)
  const right = labelMap.slice(mid)
  const lines: string[] = []
  for (let i = 0; i < left.length; i++) {
    const l = `${i + 1}) ${left[i]}   Votes: ${counts[left[i]] ?? 0}`
    const r = right[i] ? `${i + mid + 1}) ${right[i]}   Votes: ${counts[right[i]] ?? 0}` : ''
    lines.push(r ? `${l.padEnd(36)}${r}` : l)
  }
  return lines.join('\n')
}

// ── Queue embed ───────────────────────────────────────────────────────────────
function buildQueueEmbed(): EmbedBuilder {
  const total = queuePlayers.length
  const size = botConfig.queue_size
  const playerList = queuePlayers.map(p => `<@${p.discordId}>`).join(' ')
  return new EmbedBuilder()
    .setTitle('12 Man Queue')
    .setDescription(`Queue ${total}/${size}${playerList ? `\n${playerList}` : ''}`)
    .setColor(0x5865F2)
}

function buildQueueButtons(): ActionRowBuilder<ButtonBuilder>[] {
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId('queue_join').setLabel('Join Queue').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('queue_leave').setLabel('Leave Queue').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setLabel('Web Queue ↗').setStyle(ButtonStyle.Link).setURL(API_BASE_URL),
  )
  return [row]
}

async function updateQueueEmbed() {
  const guild = client.guilds.cache.get(DISCORD_GUILD_ID)
  if (!guild) return
  const channel = guild.channels.cache.get(QUEUE_CHANNEL_ID) as TextChannel
  if (!channel) return

  if (queueMessageId) {
    try {
      const msg = await channel.messages.fetch(queueMessageId)
      await msg.edit({ embeds: [buildQueueEmbed()], components: buildQueueButtons() })
      return
    } catch { /* fall through to post new */ }
  }
  const msg = await channel.send({ embeds: [buildQueueEmbed()], components: buildQueueButtons() })
  queueMessageId = msg.id
}

// ── Queue persistence ─────────────────────────────────────────────────────────
async function persistQueue() {
  // Clear and rewrite entire queue state
  await supabase.from('twelve_man_queue_state').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  if (queuePlayers.length === 0) return
  await supabase.from('twelve_man_queue_state').insert(
    queuePlayers.map((p, i) => ({
      discord_user_id: p.discordId,
      discord_username: p.discordUsername,
      joined_at: new Date(p.joinedAt).toISOString(),
      is_waitlist: false,
    }))
  )
}

async function clearPersistedQueue() {
  await supabase.from('twelve_man_queue_state').delete().neq('id', '00000000-0000-0000-0000-000000000000')
}

async function loadQueueFromDB() {
  const { data } = await supabase
    .from('twelve_man_queue_state')
    .select('*')
    .eq('is_waitlist', false)
    .order('joined_at', { ascending: true })

  if (!data || data.length === 0) {
    console.log('[12man] No persisted queue state found')
    return
  }

  queuePlayers = data.map((r: any) => ({
    discordId: r.discord_user_id,
    discordUsername: r.discord_username,
    joinedAt: new Date(r.joined_at).getTime(),
  }))

  console.log(`[12man] Restored ${queuePlayers.length} players from DB`)
}

// ── Re-queue all players (cancel protection) ──────────────────────────────────
async function requeueAllPlayers(players: QueuePlayer[]) {
  // Put them at the front of the queue
  const existing = new Set(queuePlayers.map(p => p.discordId))
  const toAdd = players.filter(p => !existing.has(p.discordId) && !bannedPlayers.has(p.discordId))
  queuePlayers = [...toAdd, ...queuePlayers]

  // Cap at queue size
  if (queuePlayers.length > botConfig.queue_size) {
    queueWaitlist = [...queuePlayers.slice(botConfig.queue_size), ...queueWaitlist]
    queuePlayers = queuePlayers.slice(0, botConfig.queue_size)
  }

  await updateQueueEmbed()
  await persistQueue()
  console.log(`[12man] Re-queued ${toAdd.length} players after match cancellation`)
}

// ── Match initiation ──────────────────────────────────────────────────────────
async function initiateMatch(overridePlayers?: QueuePlayer[]) {
  if (activeMatch) return
  const guild = client.guilds.cache.get(DISCORD_GUILD_ID)
  if (!guild) return

  matchCounter++
  const matchNum = matchCounter
  const players = overridePlayers ?? [...queuePlayers]
  const waitlist = [...queueWaitlist]

  console.log(`[12man] Initiating match #${matchNum} with ${players.length} players`)

  const adminRoleIds = [
    guild.roles.cache.find(r => r.name === 'Administrator')?.id,
    guild.roles.cache.find(r => r.name === 'Sapphire')?.id,
    guild.roles.cache.find(r => r.name === 'Spectator')?.id,
    guild.roles.cache.find(r => r.name === 'ModMail')?.id,
    guild.roles.cache.find(r => r.name === '12man special privileges')?.id,
    guild.roles.cache.find(r => r.name === 'Chanserv')?.id,
  ].filter(Boolean) as string[]

  const permissionOverwrites: any[] = [
    { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
    { id: client.user!.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.MoveMembers] },
    ...players.map(p => ({ id: p.discordId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak] })),
    ...adminRoleIds.map(id => ({ id, allow: [PermissionFlagsBits.ViewChannel] })),
  ]

  const textChannel = await guild.channels.create({
    name: `queue-${matchNum}`,
    type: ChannelType.GuildText,
    permissionOverwrites,
  })

  const gatherVoice = await guild.channels.create({
    name: `Queue#${matchNum}`,
    type: ChannelType.GuildVoice,
    permissionOverwrites,
  })

  activeMatch = {
    matchNumber: matchNum,
    textChannelId: textChannel.id,
    gatherVoiceId: gatherVoice.id,
    players,
    waitlist,
    confirmedInVoice: new Set(),
    captainA: undefined,
    captainB: undefined,
    teamA: [],
    teamB: [],
    voteOrder: [...botConfig.vote_order],
    currentVoteStep: 0,
    captainVotes: {},
    mapVotes: {},
    serverVotes: {},
    winnerVotes: {},
    draftPickIndex: 0,
    draftOrder: [],
    remainingPlayers: [],
    timeoutTimers: new Map(),
  }

  // Move players already in voice
  for (const player of players) {
    try {
      const member = guild.members.cache.get(player.discordId) ?? await guild.members.fetch(player.discordId)
      if (member.voice.channelId) await member.voice.setChannel(gatherVoice.id)
    } catch { /* not in voice */ }
  }

  const ping = players.map(p => `<@${p.discordId}>`).join(' ')
  await textChannel.send({
    content: `${ping}\n\n**Queue #${matchNum} has started!** Join voice channel **Queue#${matchNum}** to confirm your presence.\n\nYou have **${botConfig.activity_window_minutes} minutes** to join voice.`,
  })

  // Clear public queue only if we used the real queue (not forcestart override)
  if (!overridePlayers) {
    queuePlayers = []
    queueWaitlist = []
    await updateQueueEmbed()
    await clearPersistedQueue()
  }

  activeMatch.activityTimer = setTimeout(() => runActivityCheck(), botConfig.activity_window_minutes * 60 * 1000)
}

// ── Activity check ────────────────────────────────────────────────────────────
async function runActivityCheck() {
  if (!activeMatch) return
  const guild = client.guilds.cache.get(DISCORD_GUILD_ID)
  if (!guild) return

  const gatherChannel = guild.channels.cache.get(activeMatch.gatherVoiceId) as VoiceChannel
  const membersInVoice = new Set(gatherChannel?.members.keys() ?? [])
  const afkPlayers = activeMatch.players.filter(p => !membersInVoice.has(p.discordId))
  activeMatch.confirmedInVoice = membersInVoice

  console.log(`[12man] Activity check — ${membersInVoice.size} confirmed, ${afkPlayers.length} AFK`)

  if (afkPlayers.length === 0) { await startVoteSequence(); return }
  await handleAfkPlayers(afkPlayers)
}

// ── AFK / sub flow ────────────────────────────────────────────────────────────
async function handleAfkPlayers(afkPlayers: QueuePlayer[]) {
  if (!activeMatch) return
  const guild = client.guilds.cache.get(DISCORD_GUILD_ID)
  const textChannel = guild?.channels.cache.get(activeMatch.textChannelId) as TextChannel

  // Remove AFK players from match
  for (const afk of afkPlayers) {
    const idx = activeMatch.players.findIndex(p => p.discordId === afk.discordId)
    if (idx !== -1) activeMatch.players.splice(idx, 1)
  }

  if (activeMatch.waitlist.length === 0) {
    const afkNames = afkPlayers.map(p => `@${p.discordUsername}`).join(', ')
    await textChannel?.send({ content: `❌ Queue cancelled — ${afkNames} did not join voice.\nDeleting channels in 18 seconds.` })
    await cancelMatch(activeMatch.players) // re-queue confirmed players
    return
  }

  await tryNextSub(afkPlayers, 0)
}

async function tryNextSub(afkPlayers: QueuePlayer[], waitlistIdx: number) {
  if (!activeMatch) return
  const guild = client.guilds.cache.get(DISCORD_GUILD_ID)
  const textChannel = guild?.channels.cache.get(activeMatch.textChannelId) as TextChannel

  if (waitlistIdx >= activeMatch.waitlist.length) {
    await textChannel?.send({ content: `❌ No available subs. Queue cancelled.\nDeleting channels in 18 seconds.` })
    await cancelMatch(activeMatch.players)
    return
  }

  const sub = activeMatch.waitlist[waitlistIdx]
  const afkNames = afkPlayers.map(p => `<@${p.discordId}>`).join(', ')

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`sub_accept_${waitlistIdx}`).setLabel('✅ Accept').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`sub_decline_${waitlistIdx}`).setLabel('❌ Decline').setStyle(ButtonStyle.Danger),
  )

  await textChannel?.send({
    content: `<@${sub.discordId}> — ${afkNames} didn't join voice.\nDo you want to sub in?`,
    components: [row],
  })

  const timer = setTimeout(() => tryNextSub(afkPlayers, waitlistIdx + 1), botConfig.sub_window_minutes * 60 * 1000)
  if (activeMatch) activeMatch.activityTimer = timer
}

// ── Cancel match with re-queue protection ─────────────────────────────────────
async function cancelMatch(playersToRequeue: QueuePlayer[]) {
  if (!activeMatch) return
  const savedPlayers = [...playersToRequeue]
  await cleanupMatch()
  await requeueAllPlayers(savedPlayers)
}

// ── Vote sequence ─────────────────────────────────────────────────────────────
async function startVoteSequence() {
  if (!activeMatch) return
  activeMatch.currentVoteStep = 0
  await runNextVoteStep()
}

async function runNextVoteStep() {
  if (!activeMatch) return
  const step = activeMatch.voteOrder[activeMatch.currentVoteStep]
  if (!step) return
  switch (step) {
    case 'captain': await startCaptainVote(); break
    case 'map':     await startMapVote();     break
    case 'server':  await startServerVote();  break
    case 'draft':   await startDraft();       break
  }
}

async function advanceVoteStep() {
  if (!activeMatch) return
  activeMatch.currentVoteStep++
  if (activeMatch.currentVoteStep < activeMatch.voteOrder.length) {
    await runNextVoteStep()
  } else {
    await startPostDraftSetup()
  }
}

// ── Captain vote ──────────────────────────────────────────────────────────────
async function startCaptainVote() {
  if (!activeMatch) return
  const guild = client.guilds.cache.get(DISCORD_GUILD_ID)
  const textChannel = guild?.channels.cache.get(activeMatch.textChannelId) as TextChannel

  const eligible: QueuePlayer[] = []
  for (const p of activeMatch.players) {
    if (!await isOnCooldown(p.discordId)) eligible.push(p)
  }

  ;(activeMatch as any).captainCandidates = eligible
  const labels = eligible.map((p, i) => `${i + 1}) ${p.discordUsername}`)
  const voteText = formatVoteList(eligible.map(p => p.discordUsername), {})

  const embed = new EmbedBuilder()
    .setTitle('Vote for Captains')
    .setDescription(`Vote closes in ${botConfig.captain_vote_seconds}s — you cannot vote for yourself\n\n\`\`\`\n${voteText}\n\`\`\``)
    .setColor(0xF0B132)

  const rows = buildButtonRows(labels, 'captvote', ButtonStyle.Secondary)
  const msg = await textChannel?.send({ embeds: [embed], components: rows })
  if (activeMatch && msg) activeMatch.captainVoteMessageId = msg.id

  activeMatch.voteTimer = setTimeout(() => resolveCaptainVote(eligible), botConfig.captain_vote_seconds * 1000)
}

async function resolveCaptainVote(eligible: QueuePlayer[]) {
  if (!activeMatch) return
  if (activeMatch.voteTimer) clearTimeout(activeMatch.voteTimer)

  const guild = client.guilds.cache.get(DISCORD_GUILD_ID)
  const textChannel = guild?.channels.cache.get(activeMatch.textChannelId) as TextChannel

  const tally: Record<string, number> = {}
  for (const candidateId of Object.values(activeMatch.captainVotes)) tally[candidateId] = (tally[candidateId] ?? 0) + 1

  const sorted = [...eligible].sort((a, b) => (tally[b.discordId] ?? 0) - (tally[a.discordId] ?? 0))
  const top = sorted[0]
  let second = sorted[1]

  if (sorted.length > 2 && (tally[sorted[1]?.discordId] ?? 0) === (tally[sorted[2]?.discordId] ?? 0)) {
    const tied = sorted.filter(p => (tally[p.discordId] ?? 0) === (tally[sorted[1].discordId] ?? 0))
    second = tied[Math.floor(Math.random() * tied.length)]
  }

  activeMatch.captainA = top
  activeMatch.captainB = second

  const voted = Object.keys(activeMatch.captainVotes)
  const notVoted = activeMatch.players.filter(p => !voted.includes(p.discordId)).map(p => p.discordUsername)

  await textChannel?.send({
    content: [
      `**Captains selected!**`,
      `🟦 Captain A: **${top.discordUsername}**`,
      `🟥 Captain B: **${second.discordUsername}**`,
      ``,
      `Voted: ${voted.map(id => activeMatch!.players.find(p => p.discordId === id)?.discordUsername).filter(Boolean).join(', ')}`,
      notVoted.length ? `Not voted: ${notVoted.join(', ')}` : '',
    ].filter(Boolean).join('\n'),
  })

  await setCooldown(top.discordId, top.discordUsername)
  await setCooldown(second.discordId, second.discordUsername)
  await advanceVoteStep()
}

// ── Map vote ──────────────────────────────────────────────────────────────────
async function startMapVote() {
  if (!activeMatch) return
  const guild = client.guilds.cache.get(DISCORD_GUILD_ID)
  const textChannel = guild?.channels.cache.get(activeMatch.textChannelId) as TextChannel

  const allMaps = await getMapPool()
  const count = botConfig.map_count > 0 ? botConfig.map_count : allMaps.length
  const selectedMaps = [...allMaps].sort(() => Math.random() - 0.5).slice(0, count)

  ;(activeMatch as any).mapOptions = selectedMaps
  const labels = selectedMaps.map((m, i) => `${i + 1}) ${m}`)
  const voteText = formatVoteList(selectedMaps, {})

  const embed = new EmbedBuilder()
    .setTitle('Map Selection')
    .setDescription(`Vote closes in ${botConfig.map_vote_seconds}s\n\n\`\`\`\n${voteText}\n\`\`\``)
    .setColor(0x2D7D46)

  const rows = buildButtonRows(labels, 'mapvote', ButtonStyle.Secondary)
  const msg = await textChannel?.send({ embeds: [embed], components: rows })
  if (activeMatch && msg) activeMatch.mapVoteMessageId = msg.id

  activeMatch.voteTimer = setTimeout(() => resolveMapVote(selectedMaps), botConfig.map_vote_seconds * 1000)
}

async function resolveMapVote(maps: string[]) {
  if (!activeMatch) return
  if (activeMatch.voteTimer) clearTimeout(activeMatch.voteTimer)

  const guild = client.guilds.cache.get(DISCORD_GUILD_ID)
  const textChannel = guild?.channels.cache.get(activeMatch.textChannelId) as TextChannel

  const tally: Record<string, number> = {}
  for (const m of Object.values(activeMatch.mapVotes)) tally[m] = (tally[m] ?? 0) + 1

  const sorted = [...maps].sort((a, b) => (tally[b] ?? 0) - (tally[a] ?? 0))
  const topCount = tally[sorted[0]] ?? 0
  const tied = sorted.filter(m => (tally[m] ?? 0) === topCount)
  const selected = tied[Math.floor(Math.random() * tied.length)]
  activeMatch.selectedMap = selected

  const voted = Object.keys(activeMatch.mapVotes)
  const notVoted = activeMatch.players.filter(p => !voted.includes(p.discordId)).map(p => p.discordUsername)

  await textChannel?.send({
    content: [
      `🗺️ **Map selected: ${selected}**`,
      `Voted: ${voted.map(id => activeMatch!.players.find(p => p.discordId === id)?.discordUsername).filter(Boolean).join(', ')}`,
      notVoted.length ? `Not voted: ${notVoted.join(', ')}` : '',
    ].filter(Boolean).join('\n'),
  })

  await advanceVoteStep()
}

// ── Server vote ───────────────────────────────────────────────────────────────
async function startServerVote() {
  if (!activeMatch) return
  const guild = client.guilds.cache.get(DISCORD_GUILD_ID)
  const textChannel = guild?.channels.cache.get(activeMatch.textChannelId) as TextChannel

  const servers = botConfig.server_locations
  const labels = servers.map((s, i) => `${i + 1}) ${s}`)
  const voteText = formatVoteList(servers, {})

  const embed = new EmbedBuilder()
    .setTitle('Server Location')
    .setDescription(`Vote closes in ${botConfig.server_vote_seconds}s\n\n\`\`\`\n${voteText}\n\`\`\``)
    .setColor(0x5865F2)

  const rows = buildButtonRows(labels, 'servervote', ButtonStyle.Secondary)
  const msg = await textChannel?.send({ embeds: [embed], components: rows })
  if (activeMatch && msg) activeMatch.serverVoteMessageId = msg.id

  activeMatch.voteTimer = setTimeout(() => resolveServerVote(servers), botConfig.server_vote_seconds * 1000)
}

async function resolveServerVote(servers: string[]) {
  if (!activeMatch) return
  if (activeMatch.voteTimer) clearTimeout(activeMatch.voteTimer)

  const guild = client.guilds.cache.get(DISCORD_GUILD_ID)
  const textChannel = guild?.channels.cache.get(activeMatch.textChannelId) as TextChannel

  const tally: Record<string, number> = {}
  for (const s of Object.values(activeMatch.serverVotes)) tally[s] = (tally[s] ?? 0) + 1

  const sorted = [...servers].sort((a, b) => (tally[b] ?? 0) - (tally[a] ?? 0))
  const topCount = tally[sorted[0]] ?? 0
  const tied = sorted.filter(s => (tally[s] ?? 0) === topCount)
  const selected = tied[Math.floor(Math.random() * tied.length)]
  activeMatch.selectedServer = selected

  const voted = Object.keys(activeMatch.serverVotes)
  const notVoted = activeMatch.players.filter(p => !voted.includes(p.discordId)).map(p => p.discordUsername)

  await textChannel?.send({
    content: [
      `🖥️ **Server selected: ${selected}**`,
      `Voted: ${voted.map(id => activeMatch!.players.find(p => p.discordId === id)?.discordUsername).filter(Boolean).join(', ')}`,
      notVoted.length ? `Not voted: ${notVoted.join(', ')}` : '',
    ].filter(Boolean).join('\n'),
  })

  await advanceVoteStep()
}

// ── Snake draft ───────────────────────────────────────────────────────────────
async function startDraft() {
  if (!activeMatch || !activeMatch.captainA || !activeMatch.captainB) return
  const explicit = [0, 1, 1, 0, 0, 1, 1, 0, 0, 1]
  activeMatch.draftOrder = explicit
  activeMatch.draftPickIndex = 0
  activeMatch.teamA = [activeMatch.captainA]
  activeMatch.teamB = [activeMatch.captainB]
  activeMatch.remainingPlayers = activeMatch.players.filter(
    p => p.discordId !== activeMatch!.captainA!.discordId && p.discordId !== activeMatch!.captainB!.discordId
  )
  await sendDraftBoard()
}

async function sendDraftBoard() {
  if (!activeMatch || !activeMatch.captainA || !activeMatch.captainB) return
  const guild = client.guilds.cache.get(DISCORD_GUILD_ID)
  const textChannel = guild?.channels.cache.get(activeMatch.textChannelId) as TextChannel

  const pickIdx = activeMatch.draftOrder[activeMatch.draftPickIndex]
  const activeCaptain = pickIdx === 0 ? activeMatch.captainA : activeMatch.captainB

  const teamAList = activeMatch.teamA.map(p => p.discordUsername).join(', ') || '—'
  const teamBList = activeMatch.teamB.map(p => p.discordUsername).join(', ') || '—'

  const embed = new EmbedBuilder()
    .setTitle(`Draft — ${activeCaptain.discordUsername} picks`)
    .addFields(
      { name: `🟦 ${activeMatch.captainA.discordUsername} (Allies)`, value: teamAList, inline: true },
      { name: `🟥 ${activeMatch.captainB.discordUsername} (Axis)`, value: teamBList, inline: true },
    )
    .setDescription(`**Remaining:** ${activeMatch.remainingPlayers.map(p => p.discordUsername).join(' · ')}`)
    .setColor(0x5865F2)

  const labels = activeMatch.remainingPlayers.map((p, i) => `${i + 1}) ${p.discordUsername}`)
  const rows = buildButtonRows(labels, 'draftpick', ButtonStyle.Secondary)

  if (activeMatch.draftMessageId) {
    try {
      const msg = await textChannel?.messages.fetch(activeMatch.draftMessageId)
      await msg?.edit({ embeds: [embed], components: rows })
      return
    } catch { /* post new */ }
  }

  const msg = await textChannel?.send({ embeds: [embed], components: rows })
  if (activeMatch && msg) activeMatch.draftMessageId = msg.id
}

async function handleDraftPick(playerIdx: number) {
  if (!activeMatch || !activeMatch.captainA || !activeMatch.captainB) return
  const picked = activeMatch.remainingPlayers[playerIdx]
  if (!picked) return

  const pickIdx = activeMatch.draftOrder[activeMatch.draftPickIndex]
  if (pickIdx === 0) activeMatch.teamA.push(picked)
  else activeMatch.teamB.push(picked)

  activeMatch.remainingPlayers.splice(playerIdx, 1)
  activeMatch.draftPickIndex++

  if (activeMatch.remainingPlayers.length === 0) await startPostDraftSetup()
  else await sendDraftBoard()
}

// ── Post-draft setup ──────────────────────────────────────────────────────────
async function startPostDraftSetup() {
  if (!activeMatch || !activeMatch.captainA || !activeMatch.captainB) return
  const guild = client.guilds.cache.get(DISCORD_GUILD_ID)
  const textChannel = guild?.channels.cache.get(activeMatch.textChannelId) as TextChannel
  const matchNum = activeMatch.matchNumber

  const permissionOverwrites: any[] = [
    { id: guild!.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
    { id: client.user!.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.MoveMembers] },
    ...activeMatch.players.map(p => ({ id: p.discordId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak] })),
  ]

  const teamAVoice = await guild!.channels.create({
    name: `${activeMatch.captainA.discordUsername} - #${matchNum}`,
    type: ChannelType.GuildVoice,
    permissionOverwrites,
  })
  const teamBVoice = await guild!.channels.create({
    name: `${activeMatch.captainB.discordUsername} - #${matchNum}`,
    type: ChannelType.GuildVoice,
    permissionOverwrites,
  })

  activeMatch.teamAVoiceId = teamAVoice.id
  activeMatch.teamBVoiceId = teamBVoice.id

  for (const player of activeMatch.teamA) {
    try {
      const member = guild!.members.cache.get(player.discordId) ?? await guild!.members.fetch(player.discordId)
      if (member.voice.channelId) await member.voice.setChannel(teamAVoice.id)
    } catch { /* not in voice */ }
  }
  for (const player of activeMatch.teamB) {
    try {
      const member = guild!.members.cache.get(player.discordId) ?? await guild!.members.fetch(player.discordId)
      if (member.voice.channelId) await member.voice.setChannel(teamBVoice.id)
    } catch { /* not in voice */ }
  }

  const { data: dbMatch } = await supabase
    .from('twelve_man_matches')
    .insert({
      match_number: matchNum,
      guild_id: DISCORD_GUILD_ID,
      queue_channel_id: activeMatch.textChannelId,
      captain_a_discord_id: activeMatch.captainA.discordId,
      captain_b_discord_id: activeMatch.captainB.discordId,
      team_a: activeMatch.teamA.map(p => ({ discord_id: p.discordId, username: p.discordUsername })),
      team_b: activeMatch.teamB.map(p => ({ discord_id: p.discordId, username: p.discordUsername })),
      map: activeMatch.selectedMap ?? null,
      server_location: activeMatch.selectedServer ?? null,
      status: 'in_progress',
    })
    .select('id')
    .maybeSingle()

  if (dbMatch) activeMatch.dbMatchId = dbMatch.id

  const teamAMentions = activeMatch.teamA.map(p => `<@${p.discordId}>`).join(' ')
  const teamBMentions = activeMatch.teamB.map(p => `<@${p.discordId}>`).join(' ')

  const embed = new EmbedBuilder()
    .setTitle(`⚔️ Queue#${matchNum}`)
    .addFields(
      { name: activeMatch.captainA.discordUsername, value: teamAMentions, inline: true },
      { name: activeMatch.captainB.discordUsername, value: teamBMentions, inline: true },
    )
    .addFields(
      { name: 'Map', value: activeMatch.selectedMap ?? 'TBD', inline: true },
      { name: 'Location', value: activeMatch.selectedServer ?? 'TBD', inline: true },
      { name: '🔊 Voice', value: `<#${teamAVoice.id}> · <#${teamBVoice.id}>`, inline: false },
    )
    .setColor(0x5865F2)

  await textChannel?.send({ embeds: [embed] })
  console.log(`[12man] Match #${matchNum} setup complete — awaiting KTP result`)
}

// ── Winner vote ───────────────────────────────────────────────────────────────
async function postWinnerVote(map: string | null, alliesScore: number, axisScore: number, winningSide: string) {
  if (!activeMatch || !activeMatch.captainA || !activeMatch.captainB) return
  const guild = client.guilds.cache.get(DISCORD_GUILD_ID)
  const textChannel = guild?.channels.cache.get(activeMatch.textChannelId) as TextChannel

  const embed = new EmbedBuilder()
    .setTitle(`🏆 Winner for Queue#${activeMatch.matchNumber} 🏆`)
    .setDescription(`**${winningSide} wins ${alliesScore}-${axisScore}${map ? ` on ${map}` : ''}**\n\n**${botConfig.vote_threshold} votes required to confirm**`)
    .addFields(
      { name: activeMatch.captainA.discordUsername, value: 'Votes: 0', inline: true },
      { name: activeMatch.captainB.discordUsername, value: 'Votes: 0', inline: true },
      { name: 'Tie', value: 'Votes: 0', inline: true },
    )
    .setColor(0xF0B132)

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId('winner_a').setLabel(activeMatch.captainA.discordUsername).setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('winner_b').setLabel(activeMatch.captainB.discordUsername).setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('winner_tie').setLabel('Tie').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('vote_mvp').setLabel('🏆 Vote MVP').setStyle(ButtonStyle.Success),
  )

  const msg = await textChannel?.send({ embeds: [embed], components: [row] })
  if (activeMatch && msg) activeMatch.winnerVoteMessageId = msg.id
}

async function handleWinnerVote(voterId: string, choice: 'a' | 'b' | 'tie') {
  if (!activeMatch || !activeMatch.captainA || !activeMatch.captainB) return
  activeMatch.winnerVotes[voterId] = choice

  const guild = client.guilds.cache.get(DISCORD_GUILD_ID)
  const textChannel = guild?.channels.cache.get(activeMatch.textChannelId) as TextChannel

  const aCount   = Object.values(activeMatch.winnerVotes).filter(v => v === 'a').length
  const bCount   = Object.values(activeMatch.winnerVotes).filter(v => v === 'b').length
  const tieCount = Object.values(activeMatch.winnerVotes).filter(v => v === 'tie').length
  const remaining = Math.max(0, botConfig.vote_threshold - Math.max(aCount, bCount, tieCount))

  if (activeMatch.winnerVoteMessageId) {
    try {
      const msg = await textChannel?.messages.fetch(activeMatch.winnerVoteMessageId)
      const embed = EmbedBuilder.from(msg!.embeds[0]).setFields(
        { name: activeMatch.captainA.discordUsername, value: `Votes: ${aCount}`, inline: true },
        { name: activeMatch.captainB.discordUsername, value: `Votes: ${bCount}`, inline: true },
        { name: 'Tie', value: `Votes: ${tieCount}`, inline: true },
        { name: '\u200b', value: `${remaining} more votes required`, inline: false },
      )
      await msg?.edit({ embeds: [embed] })
    } catch { /* ignore */ }
  }

  if (aCount >= botConfig.vote_threshold || bCount >= botConfig.vote_threshold || tieCount >= botConfig.vote_threshold) {
    const winner = aCount >= botConfig.vote_threshold ? 'a' : bCount >= botConfig.vote_threshold ? 'b' : 'tie'
    await resolveWinnerVote(winner)
  }
}

async function resolveWinnerVote(winner: 'a' | 'b' | 'tie') {
  if (!activeMatch || !activeMatch.captainA || !activeMatch.captainB) return
  const guild = client.guilds.cache.get(DISCORD_GUILD_ID)

  const winnerCaptain  = winner === 'a' ? activeMatch.captainA : winner === 'b' ? activeMatch.captainB : null
  const winnerTeam     = winner === 'a' ? activeMatch.teamA : winner === 'b' ? activeMatch.teamB : []
  const loserTeam      = winner === 'a' ? activeMatch.teamB : winner === 'b' ? activeMatch.teamA : []
  const loserCapName   = winner === 'a' ? activeMatch.captainB.discordUsername : activeMatch.captainA.discordUsername

  if (activeMatch.dbMatchId) {
    await supabase.from('twelve_man_matches').update({
      winner_side: winner, status: 'complete', completed_at: new Date().toISOString(),
    }).eq('id', activeMatch.dbMatchId)
  }

  await decrementCooldowns(activeMatch.captainA.discordId, activeMatch.captainB.discordId)

  const queueChannel = guild?.channels.cache.get(QUEUE_CHANNEL_ID) as TextChannel
  const winnerMentions = winnerTeam.map(p => `<@${p.discordId}>`).join(' ')
  const loserMentions  = loserTeam.map(p => `<@${p.discordId}>`).join(' ')

  const publicEmbed = new EmbedBuilder()
    .setTitle(`🏆 Winner for Queue#${activeMatch.matchNumber} 🏆`)
    .addFields(
      winner !== 'tie'
        ? [
            { name: `${winnerCaptain!.discordUsername} — Winners`, value: winnerMentions || '—', inline: true },
            { name: `${loserCapName} — Losers`, value: loserMentions || '—', inline: true },
          ]
        : [
            { name: activeMatch.captainA.discordUsername, value: activeMatch.teamA.map(p => `<@${p.discordId}>`).join(' ') || '—', inline: true },
            { name: activeMatch.captainB.discordUsername, value: activeMatch.teamB.map(p => `<@${p.discordId}>`).join(' ') || '—', inline: true },
            { name: 'Result', value: 'Tie', inline: false },
          ]
    )
    .setColor(winner === 'tie' ? 0x949BA4 : 0xF0B132)

  const mvpRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId('vote_mvp_public').setLabel('🏆 Vote MVP').setStyle(ButtonStyle.Success),
  )

  await queueChannel?.send({ embeds: [publicEmbed], components: [mvpRow] })

  const textChannel = guild?.channels.cache.get(activeMatch.textChannelId) as TextChannel
  await textChannel?.send({ content: `✅ Result confirmed! Deleting channels in 18 seconds.` })

  setTimeout(() => cleanupMatch(), 18000)
}

// ── Cleanup ───────────────────────────────────────────────────────────────────
async function cleanupMatch() {
  if (!activeMatch) return
  const guild = client.guilds.cache.get(DISCORD_GUILD_ID)

  for (const channelId of [activeMatch.textChannelId, activeMatch.gatherVoiceId, activeMatch.teamAVoiceId, activeMatch.teamBVoiceId].filter(Boolean) as string[]) {
    try { await guild?.channels.cache.get(channelId)?.delete() } catch { /* already gone */ }
  }

  if (activeMatch.activityTimer) clearTimeout(activeMatch.activityTimer)
  if (activeMatch.voteTimer) clearTimeout(activeMatch.voteTimer)
  for (const t of activeMatch.timeoutTimers.values()) clearTimeout(t)

  activeMatch = null
  console.log('[12man] Match cleanup complete')
}

// ── /verify handlers ──────────────────────────────────────────────────────────
async function sendVerifyLink(
  interaction: ChatInputCommandInteraction | ButtonInteraction,
  discordId: string,
  discordUsername: string,
  isFollowUp = false
) {
  const res = await fetch(`${API_BASE_URL}/api/verify/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-bot-secret': BOT_SECRET },
    body: JSON.stringify({ discord_id: discordId, discord_username: discordUsername }),
  })

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}))
    if (res.status === 429) {
      const msg = '⏳ Too many verification attempts. Please wait 10 minutes and try again.'
      if (isFollowUp) await (interaction as ButtonInteraction).followUp({ content: msg, flags: 64 })
      else await interaction.editReply({ content: msg })
      return
    }
    console.error('[bot] /verify token request failed:', res.status, errData)
    const msg = '❌ Something went wrong generating your verification link. Please try again.'
    if (isFollowUp) await (interaction as ButtonInteraction).followUp({ content: msg, flags: 64 })
    else await interaction.editReply({ content: msg })
    return
  }

  const data = await res.json() as { already_verified?: boolean; steam_name?: string; url?: string }

  if (data.already_verified) {
    const msg = `✅ You're already verified! Your Steam account **${data.steam_name ?? ''}** is linked.`
    if (isFollowUp) await (interaction as ButtonInteraction).followUp({ content: msg, flags: 64 })
    else await interaction.editReply({ content: msg })
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

  if (isFollowUp) await (interaction as ButtonInteraction).followUp({ content, flags: 64 })
  else await interaction.editReply({ content })
}

async function handleVerify(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ flags: 64 })
  const discordId = interaction.user.id
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
    await interaction.editReply({ content: '❌ An unexpected error occurred. Please try again or contact a moderator.' })
  }
}

async function handleVerifyLoggedIn(interaction: ButtonInteraction) {
  await interaction.deferUpdate()
  const discordId = interaction.user.id
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
    await interaction.followUp({ content: '❌ An unexpected error occurred. Please try again or contact a moderator.', flags: 64 })
  }
}

// ── /12man command handler ────────────────────────────────────────────────────
async function handle12ManCommand(interaction: ChatInputCommandInteraction) {
  const sub = interaction.options.getSubcommand()

  // ── init ──────────────────────────────────────────────────────────────────
  if (sub === 'init') {
    await interaction.deferReply({ flags: 64 })
    await updateQueueEmbed()
    await interaction.editReply({ content: '✅ Queue embed posted.' })
    return
  }

  // ── clear ─────────────────────────────────────────────────────────────────
  if (sub === 'clear') {
    await interaction.deferReply({ flags: 64 })
    queuePlayers = []
    queueWaitlist = []
    await updateQueueEmbed()
    await interaction.editReply({ content: '✅ Queue cleared.' })
    return
  }

  // ── forcestart ────────────────────────────────────────────────────────────
  if (sub === 'forcestart') {
    await interaction.deferReply({ flags: 64 })
    if (activeMatch) {
      await interaction.editReply({ content: '❌ A match is already in progress.' })
      return
    }
    if (queuePlayers.length < 1) {
      await interaction.editReply({ content: '❌ Need at least 1 player in the queue to force start.' })
      return
    }
    const players = [...queuePlayers]
    queuePlayers = []
    queueWaitlist = []
    await updateQueueEmbed()
    await clearPersistedQueue()
    await initiateMatch(players)
    await interaction.editReply({ content: `✅ Force started with ${players.length} players.` })
    return
  }

  // ── cancel ────────────────────────────────────────────────────────────────
  if (sub === 'cancel') {
    await interaction.deferReply({ flags: 64 })
    if (!activeMatch) {
      await interaction.editReply({ content: '❌ No active match to cancel.' })
      return
    }
    const guild = interaction.guild
    const textChannel = guild?.channels.cache.get(activeMatch.textChannelId) as TextChannel
    await textChannel?.send({ content: `⚠️ Match cancelled by admin. Re-queuing all players. Deleting channels in 18 seconds.` })
    await cancelMatch(activeMatch.players)
    await interaction.editReply({ content: '✅ Match cancelled. All players re-queued.' })
    return
  }

  // ── config ────────────────────────────────────────────────────────────────
  if (sub === 'config') {
    await interaction.deferReply({ flags: 64 })
    await interaction.editReply({ content: `\`\`\`json\n${JSON.stringify(botConfig, null, 2)}\n\`\`\`` })
    return
  }

  // ── cooldown ──────────────────────────────────────────────────────────────
  if (sub === 'cooldown') {
    await interaction.deferReply({ flags: 64 })
    const action = interaction.options.getString('action', true)

    if (action === 'list') {
      const { data } = await supabase
        .from('twelve_man_captain_cooldowns').select('discord_username, games_remaining').gt('games_remaining', 0)
      if (!data || data.length === 0) { await interaction.editReply({ content: 'No players on cooldown.' }); return }
      const list = data.map((r: any) => `${r.discord_username}: ${r.games_remaining} game(s) remaining`).join('\n')
      await interaction.editReply({ content: `**Captain cooldowns:**\n${list}` })
      return
    }

    if (action === 'reset') {
      const target = interaction.options.getUser('player')
      if (!target) { await interaction.editReply({ content: '❌ Please specify a player.' }); return }
      await supabase.from('twelve_man_captain_cooldowns')
        .update({ games_remaining: 0, updated_at: new Date().toISOString() }).eq('discord_user_id', target.id)
      await interaction.editReply({ content: `✅ Cooldown reset for **${target.username}**.` })
      return
    }
  }

  // ── player ────────────────────────────────────────────────────────────────
  if (sub === 'player') {
    await interaction.deferReply({ flags: 64 })
    const action = interaction.options.getString('action', true)
    const target = interaction.options.getUser('player', true)

    if (action === 'add') {
      if (bannedPlayers.has(target.id)) {
        await interaction.editReply({ content: `❌ **${target.username}** is banned from the queue.` })
        return
      }
      if (queuePlayers.find(p => p.discordId === target.id)) {
        await interaction.editReply({ content: `⚠️ **${target.username}** is already in the queue.` })
        return
      }
      if (activeMatch) {
        queueWaitlist.push({ discordId: target.id, discordUsername: target.username, joinedAt: Date.now() })
        await interaction.editReply({ content: `✅ **${target.username}** added to the waitlist.` })
        return
      }
      queuePlayers.push({ discordId: target.id, discordUsername: target.username, joinedAt: Date.now() })
      await updateQueueEmbed()
      await persistQueue()
      if (queuePlayers.length >= botConfig.queue_size) await initiateMatch()
      await interaction.editReply({ content: `✅ **${target.username}** added to the queue.` })
      return
    }

    if (action === 'remove') {
      const idx = queuePlayers.findIndex(p => p.discordId === target.id)
      if (idx === -1) {
        const wIdx = queueWaitlist.findIndex(p => p.discordId === target.id)
        if (wIdx !== -1) { queueWaitlist.splice(wIdx, 1); await interaction.editReply({ content: `✅ **${target.username}** removed from waitlist.` }); return }
        await interaction.editReply({ content: `⚠️ **${target.username}** is not in the queue.` })
        return
      }
      queuePlayers.splice(idx, 1)
      await updateQueueEmbed()
      await persistQueue()
      await interaction.editReply({ content: `✅ **${target.username}** removed from the queue.` })
      return
    }

    if (action === 'ban') {
      bannedPlayers.add(target.id)
      // Remove from queue if present
      const idx = queuePlayers.findIndex(p => p.discordId === target.id)
      if (idx !== -1) { queuePlayers.splice(idx, 1); await updateQueueEmbed() }
      await interaction.editReply({ content: `✅ **${target.username}** banned from the queue.` })
      return
    }

    if (action === 'unban') {
      bannedPlayers.delete(target.id)
      await interaction.editReply({ content: `✅ **${target.username}** unbanned from the queue.` })
      return
    }

    if (action === 'sub') {
      if (!activeMatch) { await interaction.editReply({ content: '❌ No active match.' }); return }
      const replacement = interaction.options.getUser('replacement')
      if (!replacement) { await interaction.editReply({ content: '❌ Please specify a replacement player.' }); return }

      const idx = activeMatch.players.findIndex(p => p.discordId === target.id)
      if (idx === -1) { await interaction.editReply({ content: `❌ **${target.username}** is not in the active match.` }); return }

      const subPlayer: QueuePlayer = { discordId: replacement.id, discordUsername: replacement.username, joinedAt: Date.now() }
      activeMatch.players[idx] = subPlayer

      // Update teams
      const teamAIdx = activeMatch.teamA.findIndex(p => p.discordId === target.id)
      if (teamAIdx !== -1) activeMatch.teamA[teamAIdx] = subPlayer
      const teamBIdx = activeMatch.teamB.findIndex(p => p.discordId === target.id)
      if (teamBIdx !== -1) activeMatch.teamB[teamBIdx] = subPlayer

      // Update channel permissions
      const guild = interaction.guild
      const textChannel = guild?.channels.cache.get(activeMatch.textChannelId) as TextChannel
      try {
        await textChannel?.permissionOverwrites.edit(replacement.id, { ViewChannel: true })
        await textChannel?.permissionOverwrites.delete(target.id)
      } catch { /* ignore */ }

      const textCh = guild?.channels.cache.get(activeMatch.textChannelId) as TextChannel
      await textCh?.send({ content: `🔄 **${target.username}** has been subbed out for **${replacement.username}**.` })
      await interaction.editReply({ content: `✅ **${target.username}** subbed out for **${replacement.username}**.` })
      return
    }
  }
}

// ── KTP types & parsing ───────────────────────────────────────────────────────
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

interface ParsedEmbed {
  date: string | null
  alliesPlayers: string[]
  axisPlayers: string[]
  alliesScore: number
  axisScore: number
  winningSide: 'allies' | 'axis' | null
  map: string | null
  ktpMatchId: string | null
  server: string | null
  is12Man: boolean
  complete: boolean
}

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
  const fields = embed.fields ?? []
  const statusField = fields.find(f => f.name.toLowerCase() === 'status')
  if (!statusField) return null

  const statusText = statusField.value
  const complete = statusText.includes('MATCH COMPLETE')
  if (!complete) return null

  const winnerMatch = statusText.match(/(Allies|Axis) wins!/i)
  const winningSide = winnerMatch ? (winnerMatch[1].toLowerCase() as 'allies' | 'axis') : null

  const scoreMatch = statusText.match(/Final:\s*(\d+)-(\d+)/i)
  const alliesScore = scoreMatch ? parseInt(scoreMatch[1]) : 0
  const axisScore   = scoreMatch ? parseInt(scoreMatch[2]) : 0

  const footer = embed.footer?.text ?? ''
  const mapMatch    = footer.match(/Map:\s*([^\s|]+)/i)
  const ktpIdMatch  = footer.match(/Match:\s*([^\s|]+)/i)
  const serverMatch = footer.match(/Server:\s*([^|]+)/i)
  const map         = mapMatch    ? mapMatch[1]           : null
  const ktpMatchId  = ktpIdMatch  ? ktpIdMatch[1]         : null
  const server      = serverMatch ? serverMatch[1].trim() : null
  const is12Man     = footer.includes('12MAN')

  const alliesField   = fields.find(f => /allies/i.test(f.name))
  const axisField     = fields.find(f => /axis/i.test(f.name))
  const alliesPlayers = alliesField ? parseSteamIds(alliesField.value) : []
  const axisPlayers   = axisField   ? parseSteamIds(axisField.value)   : []

  return { date: title, alliesPlayers, axisPlayers, alliesScore, axisScore, winningSide, map, ktpMatchId, server, is12Man, complete }
}

async function handle12ManResult(parsed: ParsedEmbed) {
  if (!activeMatch) { console.log('[12man] KTP result but no active match'); return }
  console.log(`[12man] Result — ${parsed.winningSide} wins ${parsed.alliesScore}-${parsed.axisScore}`)
  await postWinnerVote(parsed.map, parsed.alliesScore, parsed.axisScore, parsed.winningSide ?? 'unknown')
}

async function findDraftMatch(parsed: ParsedEmbed): Promise<MatchResult | null> {
  const allSteamId64s = [...parsed.alliesPlayers, ...parsed.axisPlayers]
  if (allSteamId64s.length === 0) { console.log('[bot] No Steam IDs'); return null }

  const { data: users } = await supabase.from('users').select('id, steam_id_64').in('steam_id_64', allSteamId64s)
  if (!users || users.length === 0) { console.log('[bot] No users matched'); return null }

  const userIds = users.map((u: any) => u.id)
  const { data: teamPlayers } = await supabase
    .from('team_players').select('user_id, team_id, side, teams(id, name, event_id)').in('user_id', userIds)
  if (!teamPlayers || teamPlayers.length === 0) { console.log('[bot] No drafted players'); return null }

  const eventOverlap: Record<string, { count: number; eventId: string }> = {}
  for (const tp of teamPlayers) {
    const eventId = (tp.teams as any)?.event_id
    if (!eventId) continue
    if (!eventOverlap[eventId]) eventOverlap[eventId] = { count: 0, eventId }
    eventOverlap[eventId].count++
  }

  const best = Object.values(eventOverlap).sort((a, b) => b.count - a.count)[0]
  if (!best || best.count < MATCH_THRESHOLD) { console.log(`[bot] Overlap ${best?.count ?? 0} below threshold`); return null }

  const { data: tournament } = await supabase
    .from('tournaments').select('id, status').eq('event_id', best.eventId).neq('status', 'complete').maybeSingle()
  if (!tournament) { console.log('[bot] No active tournament'); return null }

  const { data: matches } = await supabase
    .from('tournament_matches').select('id, team1_id, team2_id, status')
    .eq('tournament_id', tournament.id).in('status', ['pending', 'awaiting_confirmation'])
  if (!matches || matches.length === 0) { console.log('[bot] No pending matches'); return null }

  const matchedTeamIds = Array.from(new Set(
    teamPlayers.filter((tp: any) => (tp.teams as any)?.event_id === best.eventId).map((tp: any) => tp.team_id)
  ))

  const targetMatch = matches.find((m: any) => matchedTeamIds.includes(m.team1_id) || matchedTeamIds.includes(m.team2_id))
  if (!targetMatch) { console.log('[bot] Could not identify match'); return null }

  const alliesTeamIds = teamPlayers.filter((tp: any) => tp.side === 'allies' && (tp.teams as any)?.event_id === best.eventId).map((tp: any) => tp.team_id)
  const axisTeamIds   = teamPlayers.filter((tp: any) => tp.side === 'axis'   && (tp.teams as any)?.event_id === best.eventId).map((tp: any) => tp.team_id)
  const winningTeamId = parsed.winningSide === 'allies' ? (alliesTeamIds[0] ?? null) : (axisTeamIds[0] ?? null)

  return {
    tournamentId: tournament.id, matchId: (targetMatch as any).id,
    winningSide: parsed.winningSide!, score: `${parsed.alliesScore}-${parsed.axisScore}`,
    map: parsed.map, ktpMatchId: parsed.ktpMatchId,
    alliesScore: parsed.alliesScore, axisScore: parsed.axisScore,
    winnerTeamId: winningTeamId,
  } as any
}

async function reportDraftMatch(result: MatchResult & { winnerTeamId: string | null }): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE_URL}/api/tournaments/${result.tournamentId}/matches/${result.matchId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-bot-secret': BOT_SECRET },
      body: JSON.stringify({ action: 'report', winner_id: result.winnerTeamId, score_team1: result.alliesScore, score_team2: result.axisScore, map: result.map, ktp_match_id: result.ktpMatchId }),
    })
    if (!res.ok) { console.error('[bot] API report failed:', res.status); return false }
    console.log('[bot] Match reported:', result.matchId)
    return true
  } catch (err) { console.error('[bot] API error:', err); return false }
}

// ── Discord client ────────────────────────────────────────────────────────────
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
  ],
})

client.once('clientReady', async () => {
  console.log(`[bot] DRAFT_MAN5.0 online as ${client.user?.tag}`)
  await loadConfig()
  await loadQueueFromDB()
  await updateQueueEmbed()
  await registerCommands()
})

// ── Interactions ──────────────────────────────────────────────────────────────
client.on('interactionCreate', async (interaction) => {
  if (interaction.isChatInputCommand()) {
    if (interaction.commandName === 'verify') { await handleVerify(interaction); return }
    if (interaction.commandName === '12man')  { await handle12ManCommand(interaction); return }
    return
  }

  if (!interaction.isButton()) return
  const id = interaction.customId

  // Verify
  if (id.startsWith('verify_loggedin_')) { await handleVerifyLoggedIn(interaction); return }

  // Queue join/leave
  if (id === 'queue_join') {
    const guild = interaction.guild
    if (!guild) return
    const member = interaction.member as GuildMember

    if (!member.roles.cache.has(DISCORD_VERIFIED_ROLE)) {
      await interaction.reply({ content: '❌ You must be verified to join the queue. Run `/verify` first.', flags: 64 })
      return
    }
    if (bannedPlayers.has(interaction.user.id)) {
      await interaction.reply({ content: '❌ You are banned from the queue.', flags: 64 })
      return
    }
    if (queuePlayers.find(p => p.discordId === interaction.user.id)) {
      await interaction.reply({ content: '⚠️ You are already in the queue.', flags: 64 })
      return
    }
    if (activeMatch) {
      if (queueWaitlist.find(p => p.discordId === interaction.user.id)) {
        await interaction.reply({ content: '⚠️ You are already on the waitlist.', flags: 64 })
        return
      }
      queueWaitlist.push({ discordId: interaction.user.id, discordUsername: interaction.user.username, joinedAt: Date.now() })
      await interaction.reply({ content: `✅ Added to the waitlist (position ${queueWaitlist.length}).`, flags: 64 })
      return
    }
    queuePlayers.push({ discordId: interaction.user.id, discordUsername: interaction.user.username, joinedAt: Date.now() })
    await interaction.deferUpdate()
    await updateQueueEmbed()
    await persistQueue()
    if (queuePlayers.length >= botConfig.queue_size) await initiateMatch()
    return
  }

  if (id === 'queue_leave') {
    const idx = queuePlayers.findIndex(p => p.discordId === interaction.user.id)
    if (idx === -1) {
      const wIdx = queueWaitlist.findIndex(p => p.discordId === interaction.user.id)
      if (wIdx !== -1) { queueWaitlist.splice(wIdx, 1); await interaction.reply({ content: '✅ Removed from waitlist.', flags: 64 }); return }
      await interaction.reply({ content: '⚠️ You are not in the queue.', flags: 64 })
      return
    }
    queuePlayers.splice(idx, 1)
    await interaction.deferUpdate()
    await updateQueueEmbed()
    await persistQueue()
    return
  }

  // Captain vote
  if (id.startsWith('captvote_')) {
    if (!activeMatch) return
    const candidateIdx = parseInt(id.split('_')[1])
    const candidates: QueuePlayer[] = (activeMatch as any).captainCandidates ?? []
    const candidate = candidates[candidateIdx]
    if (!candidate) return
    const voterId = interaction.user.id
    if (voterId === candidate.discordId) { await interaction.reply({ content: '❌ You cannot vote for yourself.', flags: 64 }); return }
    if (activeMatch.captainVotes[voterId]) { await interaction.reply({ content: '⚠️ You have already voted.', flags: 64 }); return }
    activeMatch.captainVotes[voterId] = candidate.discordId

    const voteText = formatVoteList(candidates.map(p => p.discordUsername), activeMatch.captainVotes)
    try {
      const textChannel = interaction.guild?.channels.cache.get(activeMatch.textChannelId) as TextChannel
      if (activeMatch.captainVoteMessageId) {
        const msg = await textChannel?.messages.fetch(activeMatch.captainVoteMessageId)
        const embed = EmbedBuilder.from(msg!.embeds[0]).setDescription(
          `Vote closes in ${botConfig.captain_vote_seconds}s — you cannot vote for yourself\n\n\`\`\`\n${voteText}\n\`\`\``
        )
        await msg?.edit({ embeds: [embed] })
      }
    } catch { /* ignore */ }
    await interaction.reply({ content: `✅ Voted for **${candidate.discordUsername}**.`, flags: 64 })
    return
  }

  // Map vote
  if (id.startsWith('mapvote_')) {
    if (!activeMatch) return
    const mapIdx = parseInt(id.split('_')[1])
    const maps: string[] = (activeMatch as any).mapOptions ?? []
    const map = maps[mapIdx]
    if (!map) return
    const voterId = interaction.user.id
    if (activeMatch.mapVotes[voterId]) { await interaction.reply({ content: '⚠️ You have already voted.', flags: 64 }); return }
    activeMatch.mapVotes[voterId] = map
    await interaction.reply({ content: `✅ Voted for **${map}**.`, flags: 64 })
    return
  }

  // Server vote
  if (id.startsWith('servervote_')) {
    if (!activeMatch) return
    const serverIdx = parseInt(id.split('_')[1])
    const server = botConfig.server_locations[serverIdx]
    if (!server) return
    const voterId = interaction.user.id
    if (activeMatch.serverVotes[voterId]) { await interaction.reply({ content: '⚠️ You have already voted.', flags: 64 }); return }
    activeMatch.serverVotes[voterId] = server
    await interaction.reply({ content: `✅ Voted for **${server}**.`, flags: 64 })
    return
  }

  // Draft pick
  if (id.startsWith('draftpick_')) {
    if (!activeMatch || !activeMatch.captainA || !activeMatch.captainB) return
    const pickIdx = activeMatch.draftOrder[activeMatch.draftPickIndex]
    const activeCaptain = pickIdx === 0 ? activeMatch.captainA : activeMatch.captainB
    if (interaction.user.id !== activeCaptain.discordId) {
      await interaction.reply({ content: '❌ It is not your turn to pick.', flags: 64 })
      return
    }
    const playerIdx = parseInt(id.split('_')[1])
    await interaction.deferUpdate()
    await handleDraftPick(playerIdx)
    return
  }

  // Winner vote
  if (id === 'winner_a' || id === 'winner_b' || id === 'winner_tie') {
    if (!activeMatch) return
    const choice = id === 'winner_a' ? 'a' : id === 'winner_b' ? 'b' : 'tie'
    const voterId = interaction.user.id
    if (activeMatch.winnerVotes[voterId]) { await interaction.reply({ content: '⚠️ You have already voted.', flags: 64 }); return }
    await interaction.deferUpdate()
    await handleWinnerVote(voterId, choice as 'a' | 'b' | 'tie')
    return
  }

  if (id === 'vote_mvp' || id === 'vote_mvp_public') {
    await interaction.reply({ content: '🏆 MVP voting coming soon!', flags: 64 })
    return
  }

  // Sub accept/decline
  if (id.startsWith('sub_accept_')) {
    if (!activeMatch) return
    const waitlistIdx = parseInt(id.split('_')[2])
    const sub = activeMatch.waitlist[waitlistIdx]
    if (!sub || sub.discordId !== interaction.user.id) return
    if (activeMatch.activityTimer) clearTimeout(activeMatch.activityTimer)
    activeMatch.players.push(sub)
    activeMatch.waitlist.splice(waitlistIdx, 1)
    await interaction.reply({ content: `✅ ${sub.discordUsername} has joined as a sub!` })
    try {
      const member = interaction.guild?.members.cache.get(sub.discordId) ?? await interaction.guild?.members.fetch(sub.discordId)
      if (member?.voice.channelId) await member.voice.setChannel(activeMatch.gatherVoiceId)
    } catch { /* not in voice */ }
    if (activeMatch.players.length === botConfig.queue_size) await startVoteSequence()
    return
  }

  if (id.startsWith('sub_decline_')) {
    if (!activeMatch) return
    const waitlistIdx = parseInt(id.split('_')[2])
    const sub = activeMatch.waitlist[waitlistIdx]
    if (!sub || sub.discordId !== interaction.user.id) return
    if (activeMatch.activityTimer) clearTimeout(activeMatch.activityTimer)
    await interaction.deferUpdate()
    await tryNextSub(activeMatch.players.filter(p => !activeMatch!.confirmedInVoice.has(p.discordId)), waitlistIdx + 1)
    return
  }
})

// ── KTP result watcher ────────────────────────────────────────────────────────
async function processKTPMessage(message: Message) {
  if (message.channelId !== RESULTS_CHANNEL_ID) return
  if (!message.author.bot) return
  if (!message.embeds || message.embeds.length === 0) return

  console.log(`[bot] Embed from ${message.author.tag}`)

  for (const embed of message.embeds) {
    const parsed = parseKTPEmbed(embed)
    if (!parsed) { console.log('[bot] Not a complete result, skipping'); continue }
    console.log(`[bot] ${parsed.winningSide} wins ${parsed.alliesScore}-${parsed.axisScore} | 12MAN: ${parsed.is12Man}`)
    if (parsed.is12Man) {
      await handle12ManResult(parsed)
    } else {
      const matchResult = await findDraftMatch(parsed)
      if (!matchResult) { console.log('[bot] Could not identify draft match'); continue }
      const success = await reportDraftMatch(matchResult as any)
      if (success) console.log(`[bot] ✓ Reported draft match ${matchResult.matchId}`)
    }
  }
}

client.on('messageCreate', processKTPMessage)
client.on('messageUpdate', async (_, newMessage) => {
  if (newMessage.channelId !== RESULTS_CHANNEL_ID) return
  if (!newMessage.author?.bot) return
  const message = newMessage.partial ? await newMessage.fetch() : newMessage
  await processKTPMessage(message as Message)
})

client.on('error', (err) => { console.error('[bot] Discord client error:', err) })
process.on('unhandledRejection', (err) => { console.error('[bot] Unhandled rejection:', err) })

client.login(DISCORD_BOT_TOKEN)
