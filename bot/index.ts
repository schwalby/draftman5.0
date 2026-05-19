import 'dotenv/config'
import {
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
  VoiceState,
  PermissionsBitField,
  WebhookClient,
} from 'discord.js'

// ── Phase 2: messaging module imports ─────────────────────────────────────────
import { A, ansi, timeLeft, voteList } from './messaging/ansi'
import { getHeader } from './messaging/headers'
import { buttonRows } from './messaging/embeds'

// ── Phase 3: infrastructure singleton imports ─────────────────────────────────
import { client } from './core/client'
import { supabase } from './core/supabase'
import { safeOp } from './core/safeOp'
import { queueWebhook, webhookSend, matchSend as _matchSend, botWebhookOptions } from './messaging/WebhookSender'

// ── Env validation ────────────────────────────────────────────────────────────
const REQUIRED_ENV = [
  'DISCORD_BOT_TOKEN', 'DISCORD_CLIENT_ID', 'DISCORD_GUILD_ID',
  'DISCORD_VERIFIED_ROLE_ID', 'BOT_SECRET', 'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY', 'API_BASE_URL', 'RESULTS_CHANNEL_ID', 'QUEUE_CHANNEL_ID',
]
for (const key of REQUIRED_ENV) {
  if (!process.env[key]) { console.error(`[bot] Missing env var: ${key}`); process.exit(1) }
}

const DISCORD_BOT_TOKEN     = process.env.DISCORD_BOT_TOKEN!
const DISCORD_CLIENT_ID     = process.env.DISCORD_CLIENT_ID!
const DISCORD_GUILD_ID      = process.env.DISCORD_GUILD_ID!
const DISCORD_VERIFIED_ROLE = process.env.DISCORD_VERIFIED_ROLE_ID!
const BOT_SECRET            = process.env.BOT_SECRET!
const API_BASE_URL          = process.env.API_BASE_URL!
const RESULTS_CHANNEL_ID    = process.env.RESULTS_CHANNEL_ID!
const QUEUE_CHANNEL_ID      = process.env.QUEUE_CHANNEL_ID!
const QUEUE_CATEGORY_ID     = '1130992813627154452'
const MATCH_THRESHOLD       = 8

let TEST_MODE = process.env.TEST_MODE === 'true'



// ── Types ─────────────────────────────────────────────────────────────────────
interface QueuePlayer {
  discordId: string
  discordUsername: string
  joinedAt: number
  fake?: boolean
}

type TimerKey =
  | 'activity' | 'vote' | 'subWindow'
  | 'captainInterval' | 'mapInterval' | 'serverInterval'

interface ActiveMatch {
  matchNumber: number
  textChannelId: string
  gatherVoiceId: string
  teamAVoiceId?: string
  teamBVoiceId?: string
  players: QueuePlayer[]
  waitlist: QueuePlayer[]
  confirmedInVoice: Set<string>
  activityCheckDone: boolean
  captainA?: QueuePlayer
  captainB?: QueuePlayer
  teamA: QueuePlayer[]
  teamB: QueuePlayer[]
  voteOrder: string[]
  currentStep: number
  captainCandidates: QueuePlayer[]
  captainVotes: Record<string, string>
  mapOptions: string[]
  mapVotes: Record<string, string>
  serverVotes: Record<string, string>
  winnerVotes: Record<string, string>
  selectedMap?: string
  selectedServer?: string
  draftPickIndex: number
  draftOrder: number[]
  remainingPlayers: QueuePlayer[]
  captainVoteEndTime: number
  mapVoteEndTime: number
  serverVoteEndTime: number
  captainVoteMsgId?: string
  captainVoteListMsgId?: string
  mapVoteMsgId?: string
  mapVoteListMsgId?: string
  serverVoteMsgId?: string
  serverVoteListMsgId?: string
  draftMsgId?: string
  winnerVoteMsgId?: string
  dbMatchId?: string
  matchWebhook?: WebhookClient
  timers: Map<TimerKey, ReturnType<typeof setTimeout>>
}

// ── Global state ──────────────────────────────────────────────────────────────
let queuePlayers: QueuePlayer[]  = []
let queueWaitlist: QueuePlayer[] = []
let queueMessageId: string | null = null
let activeMatch: ActiveMatch | null = null
let matchCounter = 0
const bannedPlayers = new Set<string>()
const interactionCooldowns = new Map<string, number>()

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
  server_locations: string[]
  header_style: 'shadow' | 'small' | 'box' | 'hybrid'
}
const DEFAULT_CONFIG: BotConfig = {
  queue_size: 12, timeout_minutes: 90, activity_window_minutes: 5,
  sub_window_minutes: 2, captain_cooldown_games: 2, map_count: 5,
  vote_threshold: 7, captain_vote_seconds: 120, map_vote_seconds: 90,
  server_vote_seconds: 90,
  vote_order: ['captain', 'map', 'server', 'draft'],
  server_locations: ['Atlanta', 'Chicago', 'Dallas', 'Denver', 'New York'],
  header_style: 'shadow',
}
let botConfig: BotConfig = { ...DEFAULT_CONFIG }

// ── Utilities ─────────────────────────────────────────────────────────────────
function isFake(p: QueuePlayer) { return p.fake === true }
function realPlayers(players: QueuePlayer[]) { return players.filter(p => !isFake(p)) }

function isRateLimited(userId: string): boolean {
  const last = interactionCooldowns.get(userId) ?? 0
  if (Date.now() - last < 800) return true
  interactionCooldowns.set(userId, Date.now())
  return false
}

async function isAdmin(interaction: ChatInputCommandInteraction | ButtonInteraction): Promise<boolean> {
  const member = interaction.member as GuildMember
  if (!member) return false
  return member.permissions.has(PermissionsBitField.Flags.ManageGuild) ||
    member.roles.cache.some(r => ['Administrator', 'Sapphire', 'Mod', 'Moderator'].includes(r.name))
}

function clearTimer(match: ActiveMatch, key: TimerKey) {
  const t = match.timers.get(key)
  if (t !== undefined) { clearTimeout(t); match.timers.delete(key) }
}
function clearAllTimers(match: ActiveMatch) {
  for (const t of match.timers.values()) clearTimeout(t)
  match.timers.clear()
}
function setTimer(match: ActiveMatch, key: TimerKey, fn: () => void, ms: number) {
  clearTimer(match, key)
  match.timers.set(key, setTimeout(fn, ms))
}

// ── Config loader ─────────────────────────────────────────────────────────────
// Local matchSend wrapper — preserves existing call signature throughout index.ts
// Routes to WebhookSender.matchSend with activeMatch context
async function matchSend(payload: Parameters<WebhookClient['send']>[0], label: string) {
  if (!activeMatch) return null
  return _matchSend(payload, label, activeMatch.matchWebhook, activeMatch.textChannelId, DISCORD_GUILD_ID)
}
async function loadConfig() {
  const { data } = await supabase.from('twelve_man_config').select('*').eq('guild_id', DISCORD_GUILD_ID).maybeSingle()
  if (!data) { console.log('[bot] Using default config'); return }
  botConfig = {
    queue_size:              data.queue_size              ?? DEFAULT_CONFIG.queue_size,
    timeout_minutes:         data.timeout_minutes         ?? DEFAULT_CONFIG.timeout_minutes,
    activity_window_minutes: data.activity_window_minutes ?? DEFAULT_CONFIG.activity_window_minutes,
    sub_window_minutes:      data.sub_window_minutes      ?? DEFAULT_CONFIG.sub_window_minutes,
    captain_cooldown_games:  data.captain_cooldown_games  ?? DEFAULT_CONFIG.captain_cooldown_games,
    map_count:               data.map_count               ?? DEFAULT_CONFIG.map_count,
    vote_threshold:          data.vote_threshold          ?? DEFAULT_CONFIG.vote_threshold,
    captain_vote_seconds:    data.captain_vote_seconds    ?? DEFAULT_CONFIG.captain_vote_seconds,
    map_vote_seconds:        data.map_vote_seconds        ?? DEFAULT_CONFIG.map_vote_seconds,
    server_vote_seconds:     data.server_vote_seconds     ?? DEFAULT_CONFIG.server_vote_seconds,
    vote_order:              data.vote_order              ?? DEFAULT_CONFIG.vote_order,
    server_locations:        data.server_locations        ?? DEFAULT_CONFIG.server_locations,
    header_style:            (data.header_style           ?? DEFAULT_CONFIG.header_style) as BotConfig['header_style'],
  }
  if (data.queue_message_id) queueMessageId = data.queue_message_id
  console.log('[bot] Config loaded')
}

async function saveQueueMessageId(id: string) {
  queueMessageId = id
  await supabase.from('twelve_man_config').update({ queue_message_id: id }).eq('guild_id', DISCORD_GUILD_ID)
}

async function getMapPool(): Promise<string[]> {
  const { data } = await supabase.from('map_pool').select('map_name').eq('guild_id', DISCORD_GUILD_ID).eq('active', true)
  return data?.map((r: any) => r.map_name) ?? []
}

// ── DB: captain cooldowns ─────────────────────────────────────────────────────
async function isOnCooldown(id: string): Promise<boolean> {
  const { data } = await supabase.from('twelve_man_captain_cooldowns').select('games_remaining').eq('discord_user_id', id).maybeSingle()
  return (data?.games_remaining ?? 0) > 0
}
async function setCooldown(id: string, username: string) {
  await supabase.from('twelve_man_captain_cooldowns').upsert(
    { discord_user_id: id, discord_username: username, games_remaining: botConfig.captain_cooldown_games, updated_at: new Date().toISOString() },
    { onConflict: 'discord_user_id' }
  )
}
async function decrementCooldowns(aId: string, bId: string) {
  for (const id of [aId, bId]) {
    const { data } = await supabase.from('twelve_man_captain_cooldowns').select('games_remaining').eq('discord_user_id', id).maybeSingle()
    const cur = data?.games_remaining ?? 0
    if (cur > 0) await supabase.from('twelve_man_captain_cooldowns').update({ games_remaining: cur - 1, updated_at: new Date().toISOString() }).eq('discord_user_id', id)
  }
}

// ── DB: queue persistence (upsert per player) ─────────────────────────────────
async function persistPlayerJoin(p: QueuePlayer) {
  if (isFake(p)) return
  await supabase.from('twelve_man_queue_state').upsert(
    { discord_user_id: p.discordId, discord_username: p.discordUsername, joined_at: new Date(p.joinedAt).toISOString(), is_waitlist: false },
    { onConflict: 'discord_user_id' }
  )
}
async function persistPlayerLeave(discordId: string) {
  await supabase.from('twelve_man_queue_state').delete().eq('discord_user_id', discordId)
}
async function clearPersistedQueue() {
  await supabase.from('twelve_man_queue_state').delete().neq('id', '00000000-0000-0000-0000-000000000000')
}
async function loadQueueFromDB() {
  const { data } = await supabase.from('twelve_man_queue_state').select('*').eq('is_waitlist', false).order('joined_at', { ascending: true })
  if (!data?.length) { console.log('[12man] Queue empty on startup'); return }
  queuePlayers = data.map((r: any) => ({ discordId: r.discord_user_id, discordUsername: r.discord_username, joinedAt: new Date(r.joined_at).getTime() }))
  console.log(`[12man] Restored ${queuePlayers.length} players from DB`)
}

// ── Queue embed ───────────────────────────────────────────────────────────────
function buildQueueEmbed(): EmbedBuilder {
  const list = queuePlayers.map(p => `<@${p.discordId}>`).join(' ')
  return new EmbedBuilder()
    .setTitle('12 Man Queue')
    .setDescription(`Queue ${queuePlayers.length}/${botConfig.queue_size}${list ? `\n${list}` : ''}`)
    .setColor(0x5865F2)
}
function buildQueueButtons(): ActionRowBuilder<ButtonBuilder>[] {
  return [new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId('queue_join').setLabel('Join Queue').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('queue_leave').setLabel('Leave Queue').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setLabel('Web Queue ↗').setStyle(ButtonStyle.Link).setURL(API_BASE_URL),
  )]
}
async function updateQueueEmbed() {
  const guild = client.guilds.cache.get(DISCORD_GUILD_ID)
  const channel = guild?.channels.cache.get(QUEUE_CHANNEL_ID) as TextChannel
  if (!channel) return

  if (queueWebhook) {
    // Use webhook for NeatQueue-style colored border
    if (queueMessageId) {
      const edited = await safeOp(() => queueWebhook.editMessage(queueMessageId!, { embeds: [buildQueueEmbed()], components: buildQueueButtons() }), 'edit queue embed via webhook')
      if (edited) return
    }
    const msg = await webhookSend(queueWebhook, { embeds: [buildQueueEmbed()], components: buildQueueButtons() }, 'send queue embed via webhook')
    if (msg) await saveQueueMessageId(msg.id)
    return
  }

  // Fallback: bot message if no webhook configured
  if (queueMessageId) {
    const msg = await safeOp(() => channel.messages.fetch(queueMessageId!), 'fetch queue embed')
    if (msg) { await safeOp(() => msg.edit({ embeds: [buildQueueEmbed()], components: buildQueueButtons() }), 'edit queue embed'); return }
  }
  const msg = await safeOp(() => channel.send({ embeds: [buildQueueEmbed()], components: buildQueueButtons() }), 'send queue embed')
  if (msg) await saveQueueMessageId(msg.id)
}

// ── Re-queue ──────────────────────────────────────────────────────────────────
async function requeueAll(players: QueuePlayer[]) {
  const existing = new Set(queuePlayers.map(p => p.discordId))
  const toAdd = players.filter(p => !isFake(p) && !existing.has(p.discordId) && !bannedPlayers.has(p.discordId))
  queuePlayers = [...toAdd, ...queuePlayers].slice(0, botConfig.queue_size)
  for (const p of toAdd) await persistPlayerJoin(p)
  await updateQueueEmbed()
  console.log(`[12man] Re-queued ${toAdd.length} players`)
}

// ── Match initiation ──────────────────────────────────────────────────────────
async function initiateMatch(players: QueuePlayer[], waitlist: QueuePlayer[]) {
  if (activeMatch) return
  const guild = client.guilds.cache.get(DISCORD_GUILD_ID)
  if (!guild) return

  matchCounter++
  const num = matchCounter
  console.log(`[12man] Starting match #${num} with ${players.length} players`)

  const adminRoleIds = ['Administrator', 'Sapphire', 'Spectator', 'ModMail', '12man special privileges', 'Chanserv']
    .map(name => guild.roles.cache.find(r => r.name === name)?.id).filter(Boolean) as string[]

  // Deduplicate IDs (test mode has same ID multiple times)
  const seen = new Set<string>()
  const permOverwrites: any[] = [
    { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
    { id: client.user!.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.MoveMembers] },
  ]
  seen.add(guild.roles.everyone.id)
  seen.add(client.user!.id)
  for (const p of players) {
    if (!isFake(p) && !seen.has(p.discordId)) {
      permOverwrites.push({ id: p.discordId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak] })
      seen.add(p.discordId)
    }
  }
  for (const id of adminRoleIds) {
    if (!seen.has(id)) { permOverwrites.push({ id, allow: [PermissionFlagsBits.ViewChannel] }); seen.add(id) }
  }

  const textCh = await safeOp(() => guild.channels.create({ name: `queue-${num}`, type: ChannelType.GuildText, parent: QUEUE_CATEGORY_ID, permissionOverwrites: permOverwrites }), 'create text channel')
  const voiceCh = await safeOp(() => guild.channels.create({ name: `Queue#${num}`, type: ChannelType.GuildVoice, parent: QUEUE_CATEGORY_ID, permissionOverwrites: permOverwrites }), 'create gather voice')
  if (!textCh || !voiceCh) { console.error('[12man] Channel creation failed'); return }

  // Create webhook in private text channel for NeatQueue-style embeds
  const matchWh = await safeOp(() => (textCh as TextChannel).createWebhook({ name: 'DRAFT MAN 5.0', avatar: client.user?.avatarURL() ?? undefined }), 'create match webhook')
  const matchWebhook = matchWh ? new WebhookClient({ id: matchWh.id, token: matchWh.token! }) : null

  activeMatch = {
    matchNumber: num, textChannelId: textCh.id, gatherVoiceId: voiceCh.id,
    players: [...players], waitlist: [...waitlist],
    confirmedInVoice: new Set(), activityCheckDone: false,
    captainA: undefined, captainB: undefined, teamA: [], teamB: [],
    voteOrder: [...botConfig.vote_order], currentStep: 0,
    captainCandidates: [], captainVotes: {}, mapOptions: [], mapVotes: {},
    serverVotes: {}, winnerVotes: {}, draftPickIndex: 0, draftOrder: [],
    remainingPlayers: [], captainVoteEndTime: 0, mapVoteEndTime: 0, serverVoteEndTime: 0,
    timers: new Map(),
    matchWebhook: matchWebhook ?? undefined,
    captainVoteListMsgId: undefined,
    mapVoteListMsgId: undefined,
    serverVoteListMsgId: undefined,
  }

  // Move real players already in voice
  for (const p of realPlayers(players)) {
    const member = await safeOp(() => guild.members.fetch(p.discordId), `fetch member ${p.discordUsername}`)
    if (member?.voice.channelId) await safeOp(() => member.voice.setChannel(voiceCh.id), `move ${p.discordUsername}`)
  }

  const ping = realPlayers(players).map(p => `<@${p.discordId}>`).join(' ')
  const fakeName = TEST_MODE ? ` *(test mode — ${players.length - realPlayers(players).length} fake players)*` : ''
  const startContent = `${getHeader('queuePopped', botConfig.header_style)}\n${ping}\n\n**Queue #${num} has started!${fakeName}** Join voice channel **Queue#${num}** to confirm your presence.\n\nYou have **${botConfig.activity_window_minutes} minutes** to join voice.`

  if (matchWebhook) {
    await webhookSend(matchWebhook, { content: startContent }, 'send match start via webhook')
  } else {
    await safeOp(() => (textCh as TextChannel).send({ content: startContent }), 'send match start message')
  }

  setTimer(activeMatch, 'activity', () => runActivityCheck(), botConfig.activity_window_minutes * 60 * 1000)

  // In test mode skip activity check — fake players can't join voice
  if (TEST_MODE) {
    clearTimer(activeMatch, 'activity')
    activeMatch.activityCheckDone = true
    activeMatch.confirmedInVoice = new Set(realPlayers(players).map(p => p.discordId))
    setTimeout(() => startVoteSequence(), 2000)
  }
}

// ── Activity check ────────────────────────────────────────────────────────────
async function runActivityCheck() {
  if (!activeMatch || activeMatch.activityCheckDone) return
  const guild = client.guilds.cache.get(DISCORD_GUILD_ID)
  const gatherCh = guild?.channels.cache.get(activeMatch.gatherVoiceId) as VoiceChannel
  const inVoice = new Set([...(gatherCh?.members.keys() ?? [])].filter(id => id !== client.user!.id))
  const afk = activeMatch.players.filter(p => !isFake(p) && !inVoice.has(p.discordId))

  activeMatch.confirmedInVoice = inVoice
  activeMatch.activityCheckDone = true

  console.log(`[12man] Activity check: ${inVoice.size} confirmed, ${afk.length} AFK`)
  if (afk.length === 0) { await startVoteSequence(); return }
  await handleAfk(afk)
}

async function checkEarlyConfirm() {
  if (!activeMatch || activeMatch.activityCheckDone) return
  const guild = client.guilds.cache.get(DISCORD_GUILD_ID)
  const ch = guild?.channels.cache.get(activeMatch.gatherVoiceId) as VoiceChannel
  const inVoice = new Set([...(ch?.members.keys() ?? [])].filter(id => id !== client.user!.id))
  const allConfirmed = realPlayers(activeMatch.players).every(p => inVoice.has(p.discordId))
  if (!allConfirmed) return
  activeMatch.activityCheckDone = true
  clearTimer(activeMatch, 'activity')
  activeMatch.confirmedInVoice = inVoice
  console.log('[12man] All players confirmed early — starting votes')
  await startVoteSequence()
}

// ── AFK / sub flow ────────────────────────────────────────────────────────────
async function handleAfk(afk: QueuePlayer[]) {
  if (!activeMatch) return
  for (const p of afk) {
    const i = activeMatch.players.findIndex(x => x.discordId === p.discordId)
    if (i !== -1) activeMatch.players.splice(i, 1)
  }
  if (!activeMatch.waitlist.length) {
    const names = afk.map(p => `@${p.discordUsername}`).join(', ')
    await matchSend({ content: `❌ Queue cancelled — ${names} did not join voice. Deleting in 18s.` }, 'send cancel msg')
    await cancelMatch(activeMatch.players)
    return
  }
  await tryNextSub(afk, 0)
}

async function tryNextSub(afk: QueuePlayer[], idx: number) {
  if (!activeMatch) return
  if (idx >= activeMatch.waitlist.length) {
    await matchSend({ content: `❌ No available subs. Deleting in 18s.` }, 'no subs msg')
    await cancelMatch(activeMatch.players)
    return
  }
  const sub = activeMatch.waitlist[idx]
  const afkNames = afk.map(p => `<@${p.discordId}>`).join(', ')
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`sub_accept_${idx}`).setLabel('✅ Accept').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`sub_decline_${idx}`).setLabel('❌ Decline').setStyle(ButtonStyle.Danger),
  )
  await matchSend({ content: `<@${sub.discordId}> — ${afkNames} didn't join. Sub in?`, components: [row] }, 'sub prompt')
  setTimer(activeMatch, 'subWindow', () => tryNextSub(afk, idx + 1), botConfig.sub_window_minutes * 60 * 1000)
}

async function cancelMatch(players: QueuePlayer[]) {
  const saved = [...players]
  await cleanupMatch()
  await requeueAll(saved)
}

// ── Vote sequence ─────────────────────────────────────────────────────────────
async function startVoteSequence() {
  if (!activeMatch) return
  activeMatch.currentStep = 0
  await runStep()
}
async function runStep() {
  if (!activeMatch) return
  const step = activeMatch.voteOrder[activeMatch.currentStep]
  if (!step) { await startPostDraft(); return }
  if (step === 'captain') await startCaptainVote()
  else if (step === 'map') await startMapVote()
  else if (step === 'server') await startServerVote()
  else if (step === 'draft') await startDraft()
}
async function nextStep() {
  if (!activeMatch) return
  activeMatch.currentStep++
  await runStep()
}

// ── Captain vote ──────────────────────────────────────────────────────────────
async function startCaptainVote() {
  if (!activeMatch) return
  const guild = client.guilds.cache.get(DISCORD_GUILD_ID)
  const ch = guild?.channels.cache.get(activeMatch.textChannelId) as TextChannel

  const eligible: QueuePlayer[] = []
  for (const p of activeMatch.players) {
    if (!isFake(p) && !await isOnCooldown(p.discordId)) eligible.push(p)
    else if (isFake(p)) eligible.push(p) // fake players always eligible
  }
  activeMatch.captainCandidates = eligible

  const end = Date.now() + botConfig.captain_vote_seconds * 1000
  activeMatch.captainVoteEndTime = end

  const buildEmbed = () => new EmbedBuilder()
    .setTitle('⚔️ Vote for Captains')
    .setDescription(`Vote closes in **${timeLeft(end)}** — you cannot vote for yourself`)
    .setColor(0xF0B132)

  const labels = eligible.map((p, i) => `${i + 1}) ${p.discordUsername}`)
  await matchSend({ content: getHeader('captainVote', botConfig.header_style) }, 'send captain header')
  const voteMsg = await matchSend({ content: ansi(voteList(eligible.map(p => p.discordUsername), activeMatch!.captainVotes, true)) }, 'send captain vote list')
  const msg = await matchSend({ embeds: [buildEmbed()], components: buttonRows(labels, 'captvote') }, 'send captain vote')
  if (msg) activeMatch.captainVoteMsgId = msg.id
  if (voteMsg) activeMatch.captainVoteListMsgId = voteMsg.id

  const interval = setInterval(async () => {
    if (!activeMatch?.captainVoteMsgId) { clearInterval(interval); return }
    // Update timer embed via webhook or bot
    if (activeMatch.matchWebhook) {
      await safeOp(() => activeMatch!.matchWebhook!.editMessage(activeMatch!.captainVoteMsgId!, { embeds: [buildEmbed()] }), 'update captain vote timer')
      if (activeMatch.captainVoteListMsgId) await safeOp(() => activeMatch!.matchWebhook!.editMessage(activeMatch!.captainVoteListMsgId!, { content: ansi(voteList(eligible.map(p => p.discordUsername), activeMatch?.captainVotes ?? {}, true)) }), 'update captain vote list')
    } else {
      const guild = client.guilds.cache.get(DISCORD_GUILD_ID)
      const ch = guild?.channels.cache.get(activeMatch!.textChannelId) as TextChannel
      const m = await safeOp(() => ch.messages.fetch(activeMatch!.captainVoteMsgId!), 'fetch captain vote msg')
      if (m) await safeOp(() => m.edit({ embeds: [buildEmbed()] }), 'update captain vote timer')
      if (activeMatch?.captainVoteListMsgId) {
        const lm = await safeOp(() => ch.messages.fetch(activeMatch!.captainVoteListMsgId!), 'fetch captain list msg')
        if (lm) await safeOp(() => lm.edit({ content: ansi(voteList(eligible.map(p => p.discordUsername), activeMatch?.captainVotes ?? {}, true)) }), 'update captain vote list')
      }
    }
  }, 30000)
  setTimer(activeMatch, 'captainInterval', () => clearInterval(interval), botConfig.captain_vote_seconds * 1000 + 1000)
  setTimer(activeMatch, 'vote', () => { clearInterval(interval); resolveCaptainVote(eligible) }, botConfig.captain_vote_seconds * 1000)
}

async function resolveCaptainVote(eligible: QueuePlayer[]) {
  if (!activeMatch) return
  clearTimer(activeMatch, 'vote')
  clearTimer(activeMatch, 'captainInterval')

  const guild = client.guilds.cache.get(DISCORD_GUILD_ID)
  const ch = guild?.channels.cache.get(activeMatch.textChannelId) as TextChannel

  const tally: Record<string, number> = {}
  for (const voteStr of Object.values(activeMatch.captainVotes)) {
    for (const id of voteStr.split(',').filter(Boolean)) {
      tally[id] = (tally[id] ?? 0) + 1
    }
  }

  const sorted = [...eligible].sort((a, b) => (tally[b.discordId] ?? 0) - (tally[a.discordId] ?? 0))
  const top = sorted[0]
  let second = sorted[1]
  if (sorted.length > 2 && (tally[sorted[1]?.discordId] ?? 0) === (tally[sorted[2]?.discordId] ?? 0)) {
    const tied = sorted.filter(p => (tally[p.discordId] ?? 0) === (tally[sorted[1].discordId] ?? 0))
    second = tied[Math.floor(Math.random() * tied.length)]
  }

  activeMatch.captainA = top
  activeMatch.captainB = second

  const votedIds = Object.keys(activeMatch.captainVotes).filter(id => activeMatch!.captainVotes[id].length > 0)
  const votedNames = votedIds.map(id => activeMatch!.players.find(p => p.discordId === id)?.discordUsername).filter(Boolean)
  const notVotedNames = realPlayers(activeMatch.players).filter(p => !votedIds.includes(p.discordId)).map(p => p.discordUsername)

  const out = [
    `${A.bold}${A.yellow}⚔️ Captains Selected!${A.reset}`,
    ``,
    `${A.green}Allies: ${top.discordUsername}${A.reset}`,
    `${A.red}Axis:   ${second.discordUsername}${A.reset}`,
    ``,
    `${A.cyan}Voted:     ${votedNames.length ? votedNames.join(', ') : 'none'}${A.reset}`,
    notVotedNames.length ? `${A.white}Not voted: ${notVotedNames.join(', ')}${A.reset}` : '',
  ].filter(Boolean).join('\n')

  await matchSend({ content: ansi(out) }, 'send captain result')
  if (!isFake(top)) await setCooldown(top.discordId, top.discordUsername)
  if (!isFake(second)) await setCooldown(second.discordId, second.discordUsername)
  await nextStep()
}

// ── Map vote ──────────────────────────────────────────────────────────────────
async function startMapVote() {
  if (!activeMatch) return
  const guild = client.guilds.cache.get(DISCORD_GUILD_ID)
  const ch = guild?.channels.cache.get(activeMatch.textChannelId) as TextChannel

  const pool = await getMapPool()
  if (!pool.length) {
    await matchSend({ content: '⚠️ No maps in pool — skipping map vote.' }, 'no maps msg')
    activeMatch.selectedMap = 'TBD'
    await nextStep()
    return
  }

  const count = botConfig.map_count > 0 ? botConfig.map_count : pool.length
  const maps = [...pool].sort(() => Math.random() - 0.5).slice(0, count)
  activeMatch.mapOptions = maps

  const end = Date.now() + botConfig.map_vote_seconds * 1000
  activeMatch.mapVoteEndTime = end

  const buildEmbed = () => new EmbedBuilder()
    .setTitle('🗺️ Map Selection')
    .setDescription(`Vote closes in **${timeLeft(end)}**`)
    .setColor(0x2D7D46)

  await matchSend({ content: getHeader('mapSelection', botConfig.header_style) }, 'send map header')
  const voteMsg = await matchSend({ content: ansi(voteList(maps, activeMatch!.mapVotes, true)) }, 'send map vote list')
  const msg = await matchSend({ embeds: [buildEmbed()], components: buttonRows(maps.map((m, i) => `${i + 1}) ${m}`), 'mapvote') }, 'send map vote')
  if (msg) activeMatch.mapVoteMsgId = msg.id
  if (voteMsg) activeMatch.mapVoteListMsgId = voteMsg.id

  const interval = setInterval(async () => {
    if (!activeMatch?.mapVoteMsgId) { clearInterval(interval); return }
    if (activeMatch.matchWebhook) {
      await safeOp(() => activeMatch!.matchWebhook!.editMessage(activeMatch!.mapVoteMsgId!, { embeds: [buildEmbed()] }), 'update map timer')
      if (activeMatch.mapVoteListMsgId) await safeOp(() => activeMatch!.matchWebhook!.editMessage(activeMatch!.mapVoteListMsgId!, { content: ansi(voteList(maps, activeMatch?.mapVotes ?? {}, true)) }), 'update map list')
    } else {
      const guild = client.guilds.cache.get(DISCORD_GUILD_ID)
      const ch = guild?.channels.cache.get(activeMatch!.textChannelId) as TextChannel
      const m = await safeOp(() => ch.messages.fetch(activeMatch!.mapVoteMsgId!), 'fetch map vote')
      if (m) await safeOp(() => m.edit({ embeds: [buildEmbed()] }), 'update map timer')
      if (activeMatch?.mapVoteListMsgId) {
        const lm = await safeOp(() => ch.messages.fetch(activeMatch!.mapVoteListMsgId!), 'fetch map list')
        if (lm) await safeOp(() => lm.edit({ content: ansi(voteList(maps, activeMatch?.mapVotes ?? {}, true)) }), 'update map list')
      }
    }
  }, 30000)
  setTimer(activeMatch, 'mapInterval', () => clearInterval(interval), botConfig.map_vote_seconds * 1000 + 1000)
  setTimer(activeMatch, 'vote', () => { clearInterval(interval); resolveMapVote(maps) }, botConfig.map_vote_seconds * 1000)
}

async function resolveMapVote(maps: string[]) {
  if (!activeMatch) return
  clearTimer(activeMatch, 'vote')
  clearTimer(activeMatch, 'mapInterval')

  const guild = client.guilds.cache.get(DISCORD_GUILD_ID)
  const ch = guild?.channels.cache.get(activeMatch.textChannelId) as TextChannel

  const tally: Record<string, number> = {}
  for (const m of Object.values(activeMatch.mapVotes)) tally[m] = (tally[m] ?? 0) + 1
  const sorted = [...maps].sort((a, b) => (tally[b] ?? 0) - (tally[a] ?? 0))
  const top = tally[sorted[0]] ?? 0
  const tied = sorted.filter(m => (tally[m] ?? 0) === top)
  const selected = tied[Math.floor(Math.random() * tied.length)]
  activeMatch.selectedMap = selected

  const votedIds = Object.keys(activeMatch.mapVotes)
  const votedNames = votedIds.map(id => activeMatch!.players.find(p => p.discordId === id)?.discordUsername).filter(Boolean)
  const notVoted = realPlayers(activeMatch.players).filter(p => !votedIds.includes(p.discordId)).map(p => p.discordUsername)

  const out = [
    `${A.bold}${A.green}🗺️ Map: ${selected}${A.reset}`,
    `${A.cyan}Voted:     ${votedNames.length ? votedNames.join(', ') : 'none'}${A.reset}`,
    notVoted.length ? `${A.white}Not voted: ${notVoted.join(', ')}${A.reset}` : '',
  ].filter(Boolean).join('\n')

  await matchSend({ content: ansi(out) }, 'send map result')
  await nextStep()
}

// ── Server vote ───────────────────────────────────────────────────────────────
async function startServerVote() {
  if (!activeMatch) return
  const guild = client.guilds.cache.get(DISCORD_GUILD_ID)
  const ch = guild?.channels.cache.get(activeMatch.textChannelId) as TextChannel
  const servers = botConfig.server_locations
  const end = Date.now() + botConfig.server_vote_seconds * 1000
  activeMatch.serverVoteEndTime = end

  const buildEmbed = () => new EmbedBuilder()
    .setTitle('🖥️ Server Location')
    .setDescription(`Vote closes in **${timeLeft(end)}**`)
    .setColor(0x5865F2)

  await matchSend({ content: getHeader('serverLocation', botConfig.header_style) }, 'send server header')
  const voteMsg = await matchSend({ content: ansi(voteList(servers, activeMatch!.serverVotes, true)) }, 'send server vote list')
  const msg = await matchSend({ embeds: [buildEmbed()], components: buttonRows(servers.map((s, i) => `${i + 1}) ${s}`), 'servervote') }, 'send server vote')
  if (msg) activeMatch.serverVoteMsgId = msg.id
  if (voteMsg) activeMatch.serverVoteListMsgId = voteMsg.id

  const interval = setInterval(async () => {
    if (!activeMatch?.serverVoteMsgId) { clearInterval(interval); return }
    if (activeMatch.matchWebhook) {
      await safeOp(() => activeMatch!.matchWebhook!.editMessage(activeMatch!.serverVoteMsgId!, { embeds: [buildEmbed()] }), 'update server timer')
      if (activeMatch.serverVoteListMsgId) await safeOp(() => activeMatch!.matchWebhook!.editMessage(activeMatch!.serverVoteListMsgId!, { content: ansi(voteList(servers, activeMatch?.serverVotes ?? {}, true)) }), 'update server list')
    } else {
      const guild2 = client.guilds.cache.get(DISCORD_GUILD_ID)
      const ch2 = guild2?.channels.cache.get(activeMatch!.textChannelId) as TextChannel
      const m = await safeOp(() => ch2.messages.fetch(activeMatch!.serverVoteMsgId!), 'fetch server vote')
      if (m) await safeOp(() => m.edit({ embeds: [buildEmbed()] }), 'update server timer')
    }
  }, 30000)
  setTimer(activeMatch, 'serverInterval', () => clearInterval(interval), botConfig.server_vote_seconds * 1000 + 1000)
  setTimer(activeMatch, 'vote', () => { clearInterval(interval); resolveServerVote(servers) }, botConfig.server_vote_seconds * 1000)
}

async function resolveServerVote(servers: string[]) {
  if (!activeMatch) return
  clearTimer(activeMatch, 'vote')
  clearTimer(activeMatch, 'serverInterval')

  const guild = client.guilds.cache.get(DISCORD_GUILD_ID)
  const ch = guild?.channels.cache.get(activeMatch.textChannelId) as TextChannel

  const tally: Record<string, number> = {}
  for (const s of Object.values(activeMatch.serverVotes)) tally[s] = (tally[s] ?? 0) + 1
  const sorted = [...servers].sort((a, b) => (tally[b] ?? 0) - (tally[a] ?? 0))
  const top = tally[sorted[0]] ?? 0
  const tied = sorted.filter(s => (tally[s] ?? 0) === top)
  const selected = tied[Math.floor(Math.random() * tied.length)]
  activeMatch.selectedServer = selected

  const votedIds = Object.keys(activeMatch.serverVotes)
  const votedNames = votedIds.map(id => activeMatch!.players.find(p => p.discordId === id)?.discordUsername).filter(Boolean)
  const notVoted = realPlayers(activeMatch.players).filter(p => !votedIds.includes(p.discordId)).map(p => p.discordUsername)

  const out = [
    `${A.bold}${A.cyan}🖥️ Server: ${selected}${A.reset}`,
    `${A.cyan}Voted:     ${votedNames.length ? votedNames.join(', ') : 'none'}${A.reset}`,
    notVoted.length ? `${A.white}Not voted: ${notVoted.join(', ')}${A.reset}` : '',
  ].filter(Boolean).join('\n')

  await matchSend({ content: ansi(out) }, 'send server result')
  await nextStep()
}

// ── Draft ─────────────────────────────────────────────────────────────────────
async function startDraft() {
  if (!activeMatch || !activeMatch.captainA || !activeMatch.captainB) return
  activeMatch.draftOrder = [0, 1, 1, 0, 0, 1, 1, 0, 0, 1]
  activeMatch.draftPickIndex = 0
  activeMatch.teamA = [activeMatch.captainA]
  activeMatch.teamB = [activeMatch.captainB]
  activeMatch.remainingPlayers = activeMatch.players.filter(
    p => p.discordId !== activeMatch!.captainA!.discordId && p.discordId !== activeMatch!.captainB!.discordId
  )
  if (!activeMatch.remainingPlayers.length) { await startPostDraft(); return }
  await sendDraftBoard()
}

async function sendDraftBoard() {
  if (!activeMatch?.captainA || !activeMatch.captainB) return
  const guild = client.guilds.cache.get(DISCORD_GUILD_ID)
  const ch = guild?.channels.cache.get(activeMatch.textChannelId) as TextChannel

  const pickIdx = activeMatch.draftOrder[activeMatch.draftPickIndex]
  const active = pickIdx === 0 ? activeMatch.captainA : activeMatch.captainB

  const teamAText = activeMatch.teamA.map(p => `${A.green}${p.discordUsername}${A.reset}`).join('\n') || '—'
  const teamBText = activeMatch.teamB.map(p => `${A.red}${p.discordUsername}${A.reset}`).join('\n') || '—'
  const remaining = activeMatch.remainingPlayers.map((p, i) => `${A.white}${i + 1}) ${p.discordUsername}${A.reset}`).join('  ')

  const embed = new EmbedBuilder()
    .setTitle(`Draft — ${active.discordUsername} picks`)
    .addFields(
      { name: `🟢 ${activeMatch.captainA.discordUsername} (Allies)`, value: `\`\`\`ansi\n${teamAText}\n\`\`\``, inline: true },
      { name: `🔴 ${activeMatch.captainB.discordUsername} (Axis)`, value: `\`\`\`ansi\n${teamBText}\n\`\`\``, inline: true },
      { name: 'Remaining', value: `\`\`\`ansi\n${remaining}\n\`\`\``, inline: false },
    )
    .setColor(0x5865F2)

  const labels = activeMatch.remainingPlayers.map((p, i) => `${i + 1}) ${p.discordUsername}`)
  const rows = buttonRows(labels, 'draftpick')

  if (activeMatch.draftMsgId) {
    if (activeMatch.matchWebhook) {
      await safeOp(() => activeMatch!.matchWebhook!.editMessage(activeMatch!.draftMsgId!, { embeds: [embed], components: rows }), 'edit draft board')
      return
    }
    const guild = client.guilds.cache.get(DISCORD_GUILD_ID)
    const ch = guild?.channels.cache.get(activeMatch.textChannelId) as TextChannel
    const m = await safeOp(() => ch.messages.fetch(activeMatch!.draftMsgId!), 'fetch draft board')
    if (m) { await safeOp(() => m.edit({ embeds: [embed], components: rows }), 'edit draft board'); return }
  }
  await matchSend({ content: getHeader('snakeDraft', botConfig.header_style) }, 'send draft header')
  const msg = await matchSend({ embeds: [embed], components: rows }, 'send draft board')
  if (msg) activeMatch.draftMsgId = msg.id
}

async function handlePick(idx: number) {
  if (!activeMatch?.captainA || !activeMatch.captainB) return
  const picked = activeMatch.remainingPlayers[idx]
  if (!picked) return
  if (activeMatch.draftOrder[activeMatch.draftPickIndex] === 0) activeMatch.teamA.push(picked)
  else activeMatch.teamB.push(picked)
  activeMatch.remainingPlayers.splice(idx, 1)
  activeMatch.draftPickIndex++
  if (!activeMatch.remainingPlayers.length) await startPostDraft()
  else await sendDraftBoard()
}

// ── Post-draft ────────────────────────────────────────────────────────────────
async function startPostDraft() {
  if (!activeMatch?.captainA || !activeMatch.captainB) return
  const guild = client.guilds.cache.get(DISCORD_GUILD_ID)
  const ch = guild?.channels.cache.get(activeMatch.textChannelId) as TextChannel
  const num = activeMatch.matchNumber

  const seen2 = new Set<string>([guild!.roles.everyone.id, client.user!.id])
  const perms2: any[] = [
    { id: guild!.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
    { id: client.user!.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.MoveMembers] },
  ]
  for (const p of activeMatch.players) {
    if (!isFake(p) && !seen2.has(p.discordId)) {
      perms2.push({ id: p.discordId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak] })
      seen2.add(p.discordId)
    }
  }

  const voiceA = await safeOp(() => guild!.channels.create({ name: `${activeMatch!.captainA!.discordUsername} - #${num}`, type: ChannelType.GuildVoice, parent: QUEUE_CATEGORY_ID, permissionOverwrites: perms2 }), 'create team A voice')
  const voiceB = await safeOp(() => guild!.channels.create({ name: `${activeMatch!.captainB!.discordUsername} - #${num}`, type: ChannelType.GuildVoice, parent: QUEUE_CATEGORY_ID, permissionOverwrites: perms2 }), 'create team B voice')
  if (!voiceA || !voiceB) return

  activeMatch.teamAVoiceId = voiceA.id
  activeMatch.teamBVoiceId = voiceB.id

  const moveAll = async (team: QueuePlayer[], dest: VoiceChannel) => {
    for (const p of realPlayers(team)) {
      const m = await safeOp(() => guild!.members.fetch(p.discordId), `fetch ${p.discordUsername}`)
      if (m?.voice.channelId) await safeOp(() => m.voice.setChannel(dest.id), `move ${p.discordUsername}`)
    }
  }
  await Promise.all([moveAll(activeMatch.teamA, voiceA as VoiceChannel), moveAll(activeMatch.teamB, voiceB as VoiceChannel)])

  const { data: dbMatch } = await supabase.from('twelve_man_matches').insert({
    match_number: num, guild_id: DISCORD_GUILD_ID, queue_channel_id: activeMatch.textChannelId,
    captain_a_discord_id: activeMatch.captainA.discordId,
    captain_b_discord_id: activeMatch.captainB.discordId,
    team_a: activeMatch.teamA.map(p => ({ discord_id: p.discordId, username: p.discordUsername })),
    team_b: activeMatch.teamB.map(p => ({ discord_id: p.discordId, username: p.discordUsername })),
    map: activeMatch.selectedMap ?? null,
    server_location: activeMatch.selectedServer ?? null,
    status: 'in_progress',
  }).select('id').maybeSingle()
  if (dbMatch) activeMatch.dbMatchId = dbMatch.id

  const embed = new EmbedBuilder()
    .setTitle(`⚔️ Queue#${num}`)
    .addFields(
      { name: `🟢 ${activeMatch.captainA.discordUsername} (Allies)`, value: activeMatch.teamA.map(p => `<@${p.discordId}>`).join(' ') || '—', inline: true },
      { name: `🔴 ${activeMatch.captainB.discordUsername} (Axis)`, value: activeMatch.teamB.map(p => `<@${p.discordId}>`).join(' ') || '—', inline: true },
      { name: 'Map', value: activeMatch.selectedMap ?? 'TBD', inline: true },
      { name: 'Location', value: activeMatch.selectedServer ?? 'TBD', inline: true },
      { name: '🔊 Voice', value: `<#${voiceA.id}> · <#${voiceB.id}>`, inline: false },
    )
    .setColor(0x5865F2)

  await matchSend({ content: getHeader('matchSummary', botConfig.header_style) }, 'send match summary header')
  await matchSend({ embeds: [embed] }, 'send match summary')

  // Delete gather voice channel — players have been moved to team channels
  await safeOp(() => guild!.channels.cache.get(activeMatch!.gatherVoiceId)?.delete(), 'delete gather voice')

  console.log(`[12man] Match #${num} ready`)
}

// ── Winner vote ───────────────────────────────────────────────────────────────
async function postWinnerVote(map: string | null, alliesScore: number, axisScore: number, side: string) {
  if (!activeMatch?.captainA || !activeMatch.captainB) return
  const guild = client.guilds.cache.get(DISCORD_GUILD_ID)
  const ch = guild?.channels.cache.get(activeMatch.textChannelId) as TextChannel

  const embed = new EmbedBuilder()
    .setTitle(`🏆 Winner for Queue#${activeMatch.matchNumber} 🏆`)
    .setDescription(`**${side} wins ${alliesScore}-${axisScore}${map ? ` on ${map}` : ''}**\n\n${botConfig.vote_threshold} votes required`)
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

  const msg = await matchSend({ embeds: [embed], components: [row] }, 'send winner vote')
  if (msg) activeMatch.winnerVoteMsgId = msg.id
}

async function handleWinnerVote(voterId: string, choice: 'a' | 'b' | 'tie') {
  if (!activeMatch?.captainA || !activeMatch.captainB) return
  activeMatch.winnerVotes[voterId] = choice

  const guild = client.guilds.cache.get(DISCORD_GUILD_ID)
  const ch = guild?.channels.cache.get(activeMatch.textChannelId) as TextChannel
  const aCount = Object.values(activeMatch.winnerVotes).filter(v => v === 'a').length
  const bCount = Object.values(activeMatch.winnerVotes).filter(v => v === 'b').length
  const tCount = Object.values(activeMatch.winnerVotes).filter(v => v === 'tie').length
  const remaining = Math.max(0, botConfig.vote_threshold - Math.max(aCount, bCount, tCount))

  if (activeMatch.winnerVoteMsgId) {
    const updatedEmbed = new EmbedBuilder()
      .setTitle(`🏆 Winner for Queue#${activeMatch.matchNumber} 🏆`)
      .setDescription(`${botConfig.vote_threshold} votes required`)
      .setColor(0xF0B132)
      .addFields(
        { name: activeMatch.captainA.discordUsername, value: `Votes: ${aCount}`, inline: true },
        { name: activeMatch.captainB.discordUsername, value: `Votes: ${bCount}`, inline: true },
        { name: 'Tie', value: `Votes: ${tCount}`, inline: true },
        { name: '\u200b', value: `${remaining} more votes required`, inline: false },
      )
    if (activeMatch.matchWebhook) {
      await safeOp(() => activeMatch!.matchWebhook!.editMessage(activeMatch!.winnerVoteMsgId!, { embeds: [updatedEmbed] }), 'update winner vote')
    } else {
      const guild = client.guilds.cache.get(DISCORD_GUILD_ID)
      const ch = guild?.channels.cache.get(activeMatch.textChannelId) as TextChannel
      const m = await safeOp(() => ch.messages.fetch(activeMatch!.winnerVoteMsgId!), 'fetch winner vote')
      if (m) await safeOp(() => m.edit({ embeds: [updatedEmbed] }), 'update winner vote')
    }
  }

  if (aCount >= botConfig.vote_threshold || bCount >= botConfig.vote_threshold || tCount >= botConfig.vote_threshold) {
    const winner = aCount >= botConfig.vote_threshold ? 'a' : bCount >= botConfig.vote_threshold ? 'b' : 'tie'
    await resolveWinner(winner)
  }
}

async function resolveWinner(winner: 'a' | 'b' | 'tie') {
  if (!activeMatch?.captainA || !activeMatch.captainB) return
  const guild = client.guilds.cache.get(DISCORD_GUILD_ID)
  const winCap  = winner === 'a' ? activeMatch.captainA : winner === 'b' ? activeMatch.captainB : null
  const loseCap = winner === 'a' ? activeMatch.captainB.discordUsername : activeMatch.captainA.discordUsername
  const winTeam = winner === 'a' ? activeMatch.teamA : winner === 'b' ? activeMatch.teamB : []
  const loseTeam = winner === 'a' ? activeMatch.teamB : winner === 'b' ? activeMatch.teamA : []

  if (activeMatch.dbMatchId) {
    await supabase.from('twelve_man_matches').update({ winner_side: winner, status: 'complete', completed_at: new Date().toISOString() }).eq('id', activeMatch.dbMatchId)
  }
  if (!isFake(activeMatch.captainA) && !isFake(activeMatch.captainB)) {
    await decrementCooldowns(activeMatch.captainA.discordId, activeMatch.captainB.discordId)
  }

  const qCh = guild?.channels.cache.get(QUEUE_CHANNEL_ID) as TextChannel
  const winMentions  = realPlayers(winTeam).map(p => `<@${p.discordId}>`).join(' ')
  const loseMentions = realPlayers(loseTeam).map(p => `<@${p.discordId}>`).join(' ')

  const publicEmbed = new EmbedBuilder()
    .setTitle(`🏆 Winner for Queue#${activeMatch.matchNumber} 🏆`)
    .addFields(
      winner !== 'tie'
        ? [
            { name: `${winCap!.discordUsername} — Winners`, value: winMentions || '—', inline: true },
            { name: `${loseCap} — Losers`, value: loseMentions || '—', inline: true },
          ]
        : [
            { name: activeMatch.captainA.discordUsername, value: realPlayers(activeMatch.teamA).map(p => `<@${p.discordId}>`).join(' ') || '—', inline: true },
            { name: activeMatch.captainB.discordUsername, value: realPlayers(activeMatch.teamB).map(p => `<@${p.discordId}>`).join(' ') || '—', inline: true },
            { name: 'Result', value: 'Tie', inline: false },
          ]
    )
    .setColor(winner === 'tie' ? 0x949BA4 : 0xF0B132)

  const mvpRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId('vote_mvp_public').setLabel('🏆 Vote MVP').setStyle(ButtonStyle.Success),
  )
  if (queueWebhook) {
    await webhookSend(queueWebhook, { content: getHeader('winner', botConfig.header_style) }, 'post winner header via webhook')
    await webhookSend(queueWebhook, { embeds: [publicEmbed], components: [mvpRow] }, 'post public result via webhook')
  } else {
    await safeOp(() => qCh.send({ content: getHeader('winner', botConfig.header_style) }), 'post winner header')
    await safeOp(() => qCh.send({ embeds: [publicEmbed], components: [mvpRow] }), 'post public result')
  }

  await matchSend({ content: '✅ Result confirmed! Deleting channels in 18 seconds.' }, 'send cleanup notice')
  setTimeout(() => cleanupMatch(), 18000)
}

// ── Cleanup ───────────────────────────────────────────────────────────────────
async function cleanupMatch() {
  if (!activeMatch) return
  const guild = client.guilds.cache.get(DISCORD_GUILD_ID)
  clearAllTimers(activeMatch)

  // Destroy match webhook before deleting channel
  if (activeMatch.matchWebhook) {
    activeMatch.matchWebhook.destroy()
  }

  for (const id of [activeMatch.textChannelId, activeMatch.teamAVoiceId, activeMatch.teamBVoiceId].filter(Boolean) as string[]) {
    try { await guild?.channels.cache.get(id)?.delete() } catch { /* already gone */ }
  }
  activeMatch = null
  console.log('[12man] Match cleaned up')
}

// ── /verify ───────────────────────────────────────────────────────────────────
async function sendVerifyLink(interaction: ChatInputCommandInteraction | ButtonInteraction, discordId: string, discordUsername: string, followUp = false) {
  const res = await fetch(`${API_BASE_URL}/api/verify/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-bot-secret': BOT_SECRET },
    body: JSON.stringify({ discord_id: discordId, discord_username: discordUsername }),
  })
  if (!res.ok) {
    const msg = res.status === 429 ? '⏳ Too many attempts. Wait 10 minutes.' : '❌ Something went wrong. Try again.'
    if (followUp) await (interaction as ButtonInteraction).followUp({ content: msg, flags: 64 })
    else await interaction.editReply({ content: msg })
    return
  }
  const data = await res.json() as { already_verified?: boolean; steam_name?: string; url?: string }
  if (data.already_verified) {
    const msg = `✅ Already verified — **${data.steam_name}** is linked.`
    if (followUp) await (interaction as ButtonInteraction).followUp({ content: msg, flags: 64 })
    else await interaction.editReply({ content: msg })
    return
  }
  const content = [`**DRAFT MAN 5.0 — Steam Verification**`, ``, `🔗 ${data.url}`, ``, `Your Steam profile must be **public** during verification.`].join('\n')
  if (followUp) await (interaction as ButtonInteraction).followUp({ content, flags: 64 })
  else await interaction.editReply({ content })
}

async function handleVerify(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ flags: 64 })
  const { id: discordId, username: discordUsername } = interaction.user
  try {
    const { data: user } = await supabase.from('users').select('id').eq('discord_id', discordId).maybeSingle()
    if (!user) {
      const btn = new ButtonBuilder().setCustomId(`verify_loggedin_${discordId}`).setLabel("✓  I'm signed in — send me the link").setStyle(ButtonStyle.Success)
      await interaction.editReply({
        content: [`**You need a DRAFTMAN5.0 account first.**`, ``, `🔗 ${API_BASE_URL}/api/auth/signin/discord`, ``, `Sign in with Discord, then click the button below.`].join('\n'),
        components: [new ActionRowBuilder<ButtonBuilder>().addComponents(btn)],
      })
      return
    }
    await sendVerifyLink(interaction, discordId, discordUsername)
  } catch (err) {
    console.error('[bot] /verify error:', err)
    await interaction.editReply({ content: '❌ An error occurred. Try again.' })
  }
}

// ── /12man commands ───────────────────────────────────────────────────────────
const commands = [
  new SlashCommandBuilder().setName('verify').setDescription('Link your Steam account').toJSON(),
  new SlashCommandBuilder()
    .setName('12man').setDescription('12 man queue commands')
    .addSubcommand(s => s.setName('init').setDescription('Post the queue embed'))
    .addSubcommand(s => s.setName('clear').setDescription('Clear the queue'))
    .addSubcommand(s => s.setName('forcestart').setDescription('Force start with current players'))
    .addSubcommand(s => s.setName('cancel').setDescription('Cancel active match and re-queue all'))
    .addSubcommand(s => s.setName('settings').setDescription('View and change bot settings'))
    .addSubcommand(s => s.setName('testmode').setDescription('Toggle test mode'))
    .addSubcommand(s => s.setName('config').setDescription('View current config'))
    .addSubcommand(s =>
      s.setName('cooldown').setDescription('Manage captain cooldowns')
        .addStringOption(o => o.setName('action').setDescription('reset or list').setRequired(true)
          .addChoices({ name: 'reset', value: 'reset' }, { name: 'list', value: 'list' }))
        .addUserOption(o => o.setName('player').setDescription('Player')))
    .addSubcommand(s =>
      s.setName('player').setDescription('Manage queue players')
        .addStringOption(o => o.setName('action').setDescription('add, remove, ban, unban, or sub').setRequired(true)
          .addChoices(
            { name: 'add', value: 'add' }, { name: 'remove', value: 'remove' },
            { name: 'ban', value: 'ban' }, { name: 'unban', value: 'unban' },
            { name: 'sub', value: 'sub' },
          ))
        .addUserOption(o => o.setName('player').setDescription('Target player').setRequired(true))
        .addUserOption(o => o.setName('replacement').setDescription('Replacement (for sub)')))
    .toJSON(),
]

async function loadMatchCounter() {
  const { data } = await supabase
    .from('twelve_man_matches')
    .select('match_number')
    .order('match_number', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (data?.match_number) {
    matchCounter = data.match_number
    console.log(`[12man] Match counter restored to ${matchCounter}`)
  }
}

async function registerCommands() {
  const rest = new REST({ version: '10' }).setToken(DISCORD_BOT_TOKEN)
  try {
    await rest.put(Routes.applicationGuildCommands(DISCORD_CLIENT_ID, DISCORD_GUILD_ID), { body: commands })
    console.log('[bot] Commands registered')
  } catch (err) { console.error('[bot] Command registration failed:', err) }
}

async function handle12Man(interaction: ChatInputCommandInteraction) {
  const sub = interaction.options.getSubcommand()

  // Admin check for all commands except testmode (anyone can toggle for testing)
  if (!['testmode'].includes(sub) && !await isAdmin(interaction)) {
    await interaction.reply({ content: '❌ Admin only.', flags: 64 })
    return
  }

  if (sub === 'init') {
    await interaction.deferReply()
    await updateQueueEmbed()
    await interaction.editReply({ content: '✅ Queue embed posted.' })
    return
  }

  if (sub === 'clear') {
    await interaction.deferReply()
    queuePlayers = []
    queueWaitlist = []
    await clearPersistedQueue()
    await updateQueueEmbed()
    await interaction.editReply({ content: '✅ Queue cleared.' })
    return
  }

  if (sub === 'settings') {
    await interaction.deferReply()
    const embed = new EmbedBuilder()
      .setTitle('⚙️ DRAFT MAN 5.0 — Settings')
      .setColor(0x5865F2)
      .addFields(
        { name: '🎮 Queue Size',            value: `${botConfig.queue_size}`,              inline: true },
        { name: '⏱️ Timeout (min)',          value: `${botConfig.timeout_minutes}`,         inline: true },
        { name: '🎤 Activity Window (min)',  value: `${botConfig.activity_window_minutes}`, inline: true },
        { name: '🔄 Sub Window (min)',       value: `${botConfig.sub_window_minutes}`,      inline: true },
        { name: '👑 Captain Cooldown',       value: `${botConfig.captain_cooldown_games} games`, inline: true },
        { name: '🗺️ Maps Per Vote',          value: `${botConfig.map_count === 0 ? 'All' : botConfig.map_count}`, inline: true },
        { name: '✅ Vote Threshold',          value: `${botConfig.vote_threshold}`,          inline: true },
        { name: '⚔️ Captain Vote (sec)',     value: `${botConfig.captain_vote_seconds}`,   inline: true },
        { name: '🗺️ Map Vote (sec)',          value: `${botConfig.map_vote_seconds}`,        inline: true },
        { name: '🖥️ Server Vote (sec)',      value: `${botConfig.server_vote_seconds}`,    inline: true },
        { name: '🎨 Header Style',           value: botConfig.header_style,                inline: true },
        { name: '📋 Vote Order',             value: botConfig.vote_order.join(' → '),      inline: true },
        { name: '🖥️ Server Locations',       value: botConfig.server_locations.join(', '), inline: false },
        { name: '🧪 Test Mode',              value: TEST_MODE ? '✅ ON' : '❌ OFF',          inline: true },
      )

    // Row 1 — queue settings (blue)
    const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId('setting_queue_size').setLabel('Queue Size').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('setting_timeout').setLabel('Timeout (min)').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('setting_activity_window_minutes').setLabel('Activity Window').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('setting_sub_window_minutes').setLabel('Sub Window').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('setting_captain_cooldown_games').setLabel('Captain Cooldown').setStyle(ButtonStyle.Primary),
    )
    // Row 2 — vote settings (green)
    const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId('setting_map_count').setLabel('Maps Per Vote').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('setting_vote_threshold').setLabel('Vote Threshold').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('setting_captain_vote_seconds').setLabel('Captain Vote (sec)').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('setting_map_vote_seconds').setLabel('Map Vote (sec)').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('setting_server_vote_seconds').setLabel('Server Vote (sec)').setStyle(ButtonStyle.Success),
    )
    // Row 3 — style/meta (grey + red)
    const row3 = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId('setting_header_style').setLabel(`Header: ${botConfig.header_style}`).setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('setting_vote_order').setLabel('Vote Order').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('setting_testmode').setLabel(`Test Mode: ${TEST_MODE ? 'ON' : 'OFF'}`).setStyle(TEST_MODE ? ButtonStyle.Success : ButtonStyle.Danger),
    )

    await interaction.editReply({ embeds: [embed], components: [row1, row2, row3] })
    return
  }

  if (sub === 'testmode') {
    await interaction.deferReply()
    TEST_MODE = !TEST_MODE
    await interaction.editReply({ content: `🧪 Test mode: **${TEST_MODE ? 'ON' : 'OFF'}**` })
    return
  }

  if (sub === 'forcestart') {
    await interaction.deferReply()
    if (activeMatch) { await interaction.editReply({ content: '❌ Match already in progress.' }); return }
    if (!queuePlayers.length) { await interaction.editReply({ content: '❌ Queue is empty.' }); return }

    let players = [...queuePlayers]
    const waitlist = [...queueWaitlist]

    if (TEST_MODE && players.length < botConfig.queue_size) {
      const real = players[0]
      let n = 0
      while (players.length < botConfig.queue_size) {
        n++
        players.push({ discordId: `fake_${n}`, discordUsername: `${real.discordUsername}(${n})`, joinedAt: Date.now(), fake: true })
      }
    }

    queuePlayers = []
    queueWaitlist = []
    await clearPersistedQueue()
    await updateQueueEmbed()
    await initiateMatch(players, waitlist)
    await interaction.editReply({ content: `✅ Started with ${players.length} players${TEST_MODE ? ' (TEST MODE)' : ''}.` })
    return
  }

  if (sub === 'cancel') {
    await interaction.deferReply()
    if (!activeMatch) { await interaction.editReply({ content: '❌ No active match.' }); return }
    await matchSend({ content: '⚠️ Match cancelled by admin. Re-queuing all players. Deleting in 18s.' }, 'cancel notice')
    await cancelMatch(activeMatch.players)
    await interaction.editReply({ content: '✅ Cancelled. All players re-queued.' })
    return
  }

  if (sub === 'config') {
    await interaction.deferReply()
    await interaction.editReply({ content: `\`\`\`json\n${JSON.stringify({ ...botConfig, TEST_MODE }, null, 2)}\n\`\`\`` })
    return
  }

  if (sub === 'cooldown') {
    await interaction.deferReply()
    const action = interaction.options.getString('action', true)
    if (action === 'list') {
      const { data } = await supabase.from('twelve_man_captain_cooldowns').select('discord_username, games_remaining').gt('games_remaining', 0)
      if (!data?.length) { await interaction.editReply({ content: 'No players on cooldown.' }); return }
      await interaction.editReply({ content: `**Cooldowns:**\n${data.map((r: any) => `${r.discord_username}: ${r.games_remaining} game(s)`).join('\n')}` })
      return
    }
    const target = interaction.options.getUser('player')
    if (!target) { await interaction.editReply({ content: '❌ Specify a player.' }); return }
    await supabase.from('twelve_man_captain_cooldowns').update({ games_remaining: 0, updated_at: new Date().toISOString() }).eq('discord_user_id', target.id)
    await interaction.editReply({ content: `✅ Cooldown reset for **${target.username}**.` })
    return
  }

  if (sub === 'player') {
    await interaction.deferReply()
    const action = interaction.options.getString('action', true)
    const target = interaction.options.getUser('player', true)

    if (action === 'add') {
      if (bannedPlayers.has(target.id)) { await interaction.editReply({ content: `❌ **${target.username}** is banned.` }); return }
      if (queuePlayers.find(p => p.discordId === target.id)) { await interaction.editReply({ content: `⚠️ Already in queue.` }); return }
      if (activeMatch) { queueWaitlist.push({ discordId: target.id, discordUsername: target.username, joinedAt: Date.now() }); await interaction.editReply({ content: `✅ Added to waitlist.` }); return }
      const p: QueuePlayer = { discordId: target.id, discordUsername: target.username, joinedAt: Date.now() }
      queuePlayers.push(p)
      await persistPlayerJoin(p)
      await updateQueueEmbed()
      if (queuePlayers.length >= botConfig.queue_size) {
        const players = [...queuePlayers]; const wl = [...queueWaitlist]
        queuePlayers = []; queueWaitlist = []
        await clearPersistedQueue(); await updateQueueEmbed()
        await initiateMatch(players, wl)
      }
      await interaction.editReply({ content: `✅ **${target.username}** added.` })
      return
    }

    if (action === 'remove') {
      const idx = queuePlayers.findIndex(p => p.discordId === target.id)
      if (idx !== -1) {
        queuePlayers.splice(idx, 1)
        await persistPlayerLeave(target.id)
        await updateQueueEmbed()
        await interaction.editReply({ content: `✅ **${target.username}** removed.` })
        return
      }
      const wIdx = queueWaitlist.findIndex(p => p.discordId === target.id)
      if (wIdx !== -1) { queueWaitlist.splice(wIdx, 1); await interaction.editReply({ content: `✅ Removed from waitlist.` }); return }
      await interaction.editReply({ content: `⚠️ Not in queue.` })
      return
    }

    if (action === 'ban') {
      bannedPlayers.add(target.id)
      const idx = queuePlayers.findIndex(p => p.discordId === target.id)
      if (idx !== -1) { queuePlayers.splice(idx, 1); await persistPlayerLeave(target.id); await updateQueueEmbed() }
      await interaction.editReply({ content: `✅ **${target.username}** banned.` })
      return
    }

    if (action === 'unban') {
      bannedPlayers.delete(target.id)
      await interaction.editReply({ content: `✅ **${target.username}** unbanned.` })
      return
    }

    if (action === 'sub') {
      if (!activeMatch) { await interaction.editReply({ content: '❌ No active match.' }); return }
      const replacement = interaction.options.getUser('replacement')
      if (!replacement) { await interaction.editReply({ content: '❌ Specify a replacement.' }); return }
      const idx = activeMatch.players.findIndex(p => p.discordId === target.id)
      if (idx === -1) { await interaction.editReply({ content: `❌ **${target.username}** not in match.` }); return }
      const sub: QueuePlayer = { discordId: replacement.id, discordUsername: replacement.username, joinedAt: Date.now() }
      activeMatch.players[idx] = sub
      const ai = activeMatch.teamA.findIndex(p => p.discordId === target.id); if (ai !== -1) activeMatch.teamA[ai] = sub
      const bi = activeMatch.teamB.findIndex(p => p.discordId === target.id); if (bi !== -1) activeMatch.teamB[bi] = sub
      const ch = interaction.guild?.channels.cache.get(activeMatch.textChannelId) as TextChannel
      await safeOp(() => ch.permissionOverwrites.edit(replacement.id, { ViewChannel: true }), 'add sub perms')
      await safeOp(() => ch.permissionOverwrites.delete(target.id), 'remove old perms')
      await matchSend({ content: `🔄 **${target.username}** → **${replacement.username}**` }, 'sub notice')
      await interaction.editReply({ content: `✅ Subbed **${target.username}** out for **${replacement.username}**.` })
      return
    }
  }
}

// ── KTP parsing ───────────────────────────────────────────────────────────────
interface ParsedKTP {
  alliesPlayers: string[]; axisPlayers: string[]
  alliesScore: number; axisScore: number
  winningSide: 'allies' | 'axis' | null
  map: string | null; ktpMatchId: string | null
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
  const ids: string[] = []; const re = /STEAM_0:[01]:\d+/gi; let m
  while ((m = re.exec(text)) !== null) { const id = toSteam64(m[0]); if (id) ids.push(id) }
  return ids
}
function parseKTP(embed: Embed): ParsedKTP | null {
  const fields = embed.fields ?? []
  const status = fields.find(f => f.name.toLowerCase() === 'status')?.value ?? ''
  if (!status.includes('MATCH COMPLETE')) return null
  const winMatch = status.match(/(Allies|Axis) wins!/i)
  const scoreMatch = status.match(/Final:\s*(\d+)-(\d+)/i)
  const footer = embed.footer?.text ?? ''
  const mapMatch = footer.match(/Map:\s*([^\s|]+)/i)
  const ktpMatch = footer.match(/Match:\s*([^\s|]+)/i)
  const alliesF = fields.find(f => /allies/i.test(f.name))
  const axisF   = fields.find(f => /axis/i.test(f.name))
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

async function processKTP(message: Message) {
  if (message.channelId !== RESULTS_CHANNEL_ID || !message.author.bot || !message.embeds.length) return
  for (const embed of message.embeds) {
    const parsed = parseKTP(embed)
    if (!parsed) continue
    console.log(`[bot] KTP result: ${parsed.winningSide} wins ${parsed.alliesScore}-${parsed.axisScore} | 12MAN: ${parsed.is12Man}`)
    if (parsed.is12Man) {
      await postWinnerVote(parsed.map, parsed.alliesScore, parsed.axisScore, parsed.winningSide ?? 'unknown')
    } else {
      await processDraftResult(parsed)
    }
  }
}

async function processDraftResult(parsed: ParsedKTP) {
  const ids = [...parsed.alliesPlayers, ...parsed.axisPlayers]
  if (!ids.length) return
  const { data: users } = await supabase.from('users').select('id, steam_id_64').in('steam_id_64', ids)
  if (!users?.length) return
  const userIds = users.map((u: any) => u.id)
  const { data: tp } = await supabase.from('team_players').select('user_id, team_id, side, teams(id, name, event_id)').in('user_id', userIds)
  if (!tp?.length) return

  const overlap: Record<string, { count: number; eventId: string }> = {}
  for (const t of tp) {
    const eid = (t.teams as any)?.event_id
    if (!eid) continue
    if (!overlap[eid]) overlap[eid] = { count: 0, eventId: eid }
    overlap[eid].count++
  }
  const best = Object.values(overlap).sort((a, b) => b.count - a.count)[0]
  if (!best || best.count < MATCH_THRESHOLD) return

  const { data: tourney } = await supabase.from('tournaments').select('id').eq('event_id', best.eventId).neq('status', 'complete').maybeSingle()
  if (!tourney) return
  const { data: matches } = await supabase.from('tournament_matches').select('id, team1_id, team2_id').eq('tournament_id', tourney.id).in('status', ['pending', 'awaiting_confirmation'])
  if (!matches?.length) return

  const teamIds = new Set(tp.filter((t: any) => (t.teams as any)?.event_id === best.eventId).map((t: any) => t.team_id))
  const match = matches.find((m: any) => teamIds.has(m.team1_id) || teamIds.has(m.team2_id))
  if (!match) return

  const alliesTeam = tp.filter((t: any) => t.side === 'allies' && (t.teams as any)?.event_id === best.eventId).map((t: any) => t.team_id)[0]
  const axisTeam   = tp.filter((t: any) => t.side === 'axis'   && (t.teams as any)?.event_id === best.eventId).map((t: any) => t.team_id)[0]
  const winnerId   = parsed.winningSide === 'allies' ? alliesTeam : axisTeam

  await fetch(`${API_BASE_URL}/api/tournaments/${tourney.id}/matches/${(match as any).id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', 'x-bot-secret': BOT_SECRET },
    body: JSON.stringify({ action: 'report', winner_id: winnerId, score_team1: parsed.alliesScore, score_team2: parsed.axisScore, map: parsed.map, ktp_match_id: parsed.ktpMatchId }),
  }).then(r => r.ok ? console.log(`[bot] Reported draft match ${(match as any).id}`) : console.error('[bot] Report failed:', r.status))
    .catch(err => console.error('[bot] Report error:', err))
}

// ── Client event handlers ─────────────────────────────────────────────────────

client.once('clientReady', async () => {
  console.log(`[bot] Online as ${client.user?.tag} | TEST_MODE: ${TEST_MODE}`)
  await loadConfig()
  await loadMatchCounter()
  await loadQueueFromDB()
  await updateQueueEmbed()
  await registerCommands()
})

client.on('voiceStateUpdate', async (_: VoiceState, newState: VoiceState) => {
  if (activeMatch && newState.channelId === activeMatch.gatherVoiceId) await checkEarlyConfirm()
})

client.on('interactionCreate', async interaction => {
  if (interaction.isChatInputCommand()) {
    if (interaction.commandName === 'verify') await handleVerify(interaction)
    else if (interaction.commandName === '12man') await handle12Man(interaction)
    return
  }
  if (!interaction.isButton()) return

  const { customId: id, user } = interaction

  // Rate limit all button interactions
  if (isRateLimited(user.id)) { await interaction.reply({ content: '⏳ Slow down.', flags: 64 }); return }

  // Verify button
  if (id.startsWith('verify_loggedin_')) {
    await interaction.deferUpdate()
    const { data: u } = await supabase.from('users').select('id').eq('discord_id', user.id).maybeSingle()
    if (!u) {
      await interaction.followUp({ content: [`❌ Can't find your account.`, `🔗 ${API_BASE_URL}/api/auth/signin/discord`, `Sign in, then try again.`].join('\n'), flags: 64 })
      return
    }
    await sendVerifyLink(interaction, user.id, user.username, true)
    return
  }

  // Queue join
  if (id === 'queue_join') {
    const member = interaction.member as GuildMember
    if (!TEST_MODE && !member.roles.cache.has(DISCORD_VERIFIED_ROLE)) {
      await interaction.reply({ content: '❌ Run `/verify` first.', flags: 64 }); return
    }
    if (bannedPlayers.has(user.id)) { await interaction.reply({ content: '❌ You are banned from the queue.', flags: 64 }); return }
    if (queuePlayers.find(p => p.discordId === user.id)) { await interaction.reply({ content: '⚠️ Already in queue.', flags: 64 }); return }
    if (activeMatch) {
      if (queueWaitlist.find(p => p.discordId === user.id)) { await interaction.reply({ content: '⚠️ Already on waitlist.', flags: 64 }); return }
      queueWaitlist.push({ discordId: user.id, discordUsername: user.username, joinedAt: Date.now() })
      await interaction.reply({ content: `✅ Waitlist position ${queueWaitlist.length}.`, flags: 64 })
      return
    }
    const p: QueuePlayer = { discordId: user.id, discordUsername: user.username, joinedAt: Date.now() }
    queuePlayers.push(p)
    await interaction.deferUpdate()
    await persistPlayerJoin(p)
    await updateQueueEmbed()
    if (queuePlayers.length >= botConfig.queue_size) {
      const players = [...queuePlayers]; const wl = [...queueWaitlist]
      queuePlayers = []; queueWaitlist = []
      await clearPersistedQueue(); await updateQueueEmbed()
      await initiateMatch(players, wl)
    }
    return
  }

  // Queue leave
  if (id === 'queue_leave') {
    const idx = queuePlayers.findIndex(p => p.discordId === user.id)
    if (idx === -1) {
      const wIdx = queueWaitlist.findIndex(p => p.discordId === user.id)
      if (wIdx !== -1) { queueWaitlist.splice(wIdx, 1); await interaction.reply({ content: '✅ Removed from waitlist.', flags: 64 }); return }
      await interaction.reply({ content: '⚠️ Not in queue.', flags: 64 }); return
    }
    const removed = queuePlayers.splice(idx, 1)[0]
    await interaction.deferUpdate()
    await persistPlayerLeave(removed.discordId)
    await updateQueueEmbed()
    return
  }

  // Captain vote — allow switching, max 2 votes per player
  if (id.startsWith('captvote_')) {
    if (!activeMatch) return
    const idx = parseInt(id.split('_')[1])
    const candidate = activeMatch.captainCandidates[idx]
    if (!candidate) return
    if (user.id === candidate.discordId) { await interaction.reply({ content: '❌ Cannot vote for yourself.', flags: 64 }); return }
    if (!isFake({ discordId: user.id, discordUsername: '', joinedAt: 0 }) && !activeMatch.players.find(p => p.discordId === user.id)) {
      await interaction.reply({ content: '❌ Not in this match.', flags: 64 }); return
    }

    // Get existing votes for this player (stored as comma-separated string)
    const existing = activeMatch.captainVotes[user.id] ? activeMatch.captainVotes[user.id].split(',') : []

    // If already voted for this candidate, remove that vote (toggle off)
    if (existing.includes(candidate.discordId)) {
      const updated = existing.filter(v => v !== candidate.discordId)
      activeMatch.captainVotes[user.id] = updated.join(',')
      await interaction.reply({ content: `↩️ Removed vote for **${candidate.discordUsername}**. You have ${2 - updated.length} vote(s) remaining.`, flags: 64 })
    } else if (existing.length >= 2) {
      // Already used 2 votes — swap oldest
      existing.shift()
      existing.push(candidate.discordId)
      activeMatch.captainVotes[user.id] = existing.join(',')
      await interaction.reply({ content: `🔄 Switched vote to **${candidate.discordUsername}**.`, flags: 64 })
    } else {
      existing.push(candidate.discordId)
      activeMatch.captainVotes[user.id] = existing.join(',')
      const remaining = 2 - existing.length
      await interaction.reply({ content: `✅ Voted for **${candidate.discordUsername}**.${remaining > 0 ? ` You have **${remaining}** vote remaining.` : ''}`, flags: 64 })
    }

    if (activeMatch.matchWebhook) {
      if (activeMatch.captainVoteListMsgId) await safeOp(() => activeMatch!.matchWebhook!.editMessage(activeMatch!.captainVoteListMsgId!, { content: ansi(voteList(activeMatch!.captainCandidates.map(p => p.discordUsername), activeMatch!.captainVotes, true)) }), 'update capt vote list')
      if (activeMatch.captainVoteMsgId) {
        const updEmbed = new EmbedBuilder().setTitle('⚔️ Vote for Captains').setDescription(`Vote closes in **${timeLeft(activeMatch.captainVoteEndTime)}** — you cannot vote for yourself`).setColor(0xF0B132)
        await safeOp(() => activeMatch!.matchWebhook!.editMessage(activeMatch!.captainVoteMsgId!, { embeds: [updEmbed] }), 'update capt vote timer')
      }
    } else {
      const guild = interaction.guild
      const ch = guild?.channels.cache.get(activeMatch.textChannelId) as TextChannel
      if (activeMatch.captainVoteListMsgId) {
        const m = await safeOp(() => ch.messages.fetch(activeMatch!.captainVoteListMsgId!), 'fetch capt vote list')
        if (m) await safeOp(() => m.edit({ content: ansi(voteList(activeMatch!.captainCandidates.map(p => p.discordUsername), activeMatch!.captainVotes, true)) }), 'update capt vote list')
      }
      if (activeMatch.captainVoteMsgId) {
        const m = await safeOp(() => ch.messages.fetch(activeMatch!.captainVoteMsgId!), 'fetch capt vote')
        if (m) {
          const embed = EmbedBuilder.from(m.embeds[0]).setDescription(`Vote closes in **${timeLeft(activeMatch.captainVoteEndTime)}** — you cannot vote for yourself`)
          await safeOp(() => m.edit({ embeds: [embed] }), 'update capt vote timer')
        }
      }
    }
    return
  }

  // Map vote — allow switching
  if (id.startsWith('mapvote_')) {
    if (!activeMatch) return
    if (!activeMatch.players.find(p => p.discordId === user.id)) { await interaction.reply({ content: '❌ You are not a participant in this match.', flags: 64 }); return }
    const map = activeMatch.mapOptions[parseInt(id.split('_')[1])]
    if (!map) return
    const switched = !!activeMatch.mapVotes[user.id]
    activeMatch.mapVotes[user.id] = map
    if (activeMatch.matchWebhook && activeMatch.mapVoteListMsgId) {
      await safeOp(() => activeMatch!.matchWebhook!.editMessage(activeMatch!.mapVoteListMsgId!, { content: ansi(voteList(activeMatch!.mapOptions, activeMatch!.mapVotes, true)) }), 'update map vote list')
    } else {
      const ch = interaction.guild?.channels.cache.get(activeMatch.textChannelId) as TextChannel
      if (activeMatch.mapVoteListMsgId) {
        const m = await safeOp(() => ch.messages.fetch(activeMatch!.mapVoteListMsgId!), 'fetch map vote list')
        if (m) await safeOp(() => m.edit({ content: ansi(voteList(activeMatch!.mapOptions, activeMatch!.mapVotes, true)) }), 'update map vote list')
      }
    }
    await interaction.reply({ content: `${switched ? '🔄 Switched' : '✅ Voted'} for **${map}**.`, flags: 64 })
    return
  }

  // Server vote — allow switching
  if (id.startsWith('servervote_')) {
    if (!activeMatch) return
    if (!activeMatch.players.find(p => p.discordId === user.id)) { await interaction.reply({ content: '❌ You are not a participant in this match.', flags: 64 }); return }
    const server = botConfig.server_locations[parseInt(id.split('_')[1])]
    if (!server) return
    const switched = !!activeMatch.serverVotes[user.id]
    activeMatch.serverVotes[user.id] = server
    if (activeMatch.matchWebhook && activeMatch.serverVoteListMsgId) {
      await safeOp(() => activeMatch!.matchWebhook!.editMessage(activeMatch!.serverVoteListMsgId!, { content: ansi(voteList(botConfig.server_locations, activeMatch!.serverVotes, true)) }), 'update server vote list')
    } else {
      const ch = interaction.guild?.channels.cache.get(activeMatch.textChannelId) as TextChannel
      if (activeMatch.serverVoteListMsgId) {
        const m = await safeOp(() => ch.messages.fetch(activeMatch!.serverVoteListMsgId!), 'fetch server vote list')
        if (m) await safeOp(() => m.edit({ content: ansi(voteList(botConfig.server_locations, activeMatch!.serverVotes, true)) }), 'update server vote list')
      }
    }
    await interaction.reply({ content: `${switched ? '🔄 Switched' : '✅ Voted'} for **${server}**.`, flags: 64 })
    return
  }

  // Draft pick
  if (id.startsWith('draftpick_')) {
    if (!activeMatch?.captainA || !activeMatch.captainB) return
    const active = activeMatch.draftOrder[activeMatch.draftPickIndex] === 0 ? activeMatch.captainA : activeMatch.captainB
    if (user.id !== active.discordId && !isFake(active)) { await interaction.reply({ content: '❌ Not your turn.', flags: 64 }); return }
    await interaction.deferUpdate()
    await handlePick(parseInt(id.split('_')[1]))
    return
  }

  // Settings buttons
  if (id.startsWith('setting_')) {
    if (!await isAdmin(interaction)) { await interaction.reply({ content: '❌ Admin only.', flags: 64 }); return }

    const settingKey = id.replace('setting_', '')

    if (settingKey === 'testmode') {
      TEST_MODE = !TEST_MODE
      await interaction.reply({ content: `🧪 Test mode: **${TEST_MODE ? 'ON' : 'OFF'}**`, flags: 64 })
      return
    }

    if (settingKey === 'header_style') {
      const styles = ['shadow', 'small', 'box', 'hybrid']
      const current = styles.indexOf(botConfig.header_style)
      botConfig.header_style = styles[(current + 1) % styles.length] as BotConfig['header_style']
      await supabase.from('twelve_man_config').update({ header_style: botConfig.header_style }).eq('guild_id', DISCORD_GUILD_ID)
      await interaction.reply({ content: `🎨 Header style: **${botConfig.header_style}**`, flags: 64 })
      return
    }

    if (settingKey === 'vote_order') {
      await interaction.reply({ content: `📋 Current vote order: **${botConfig.vote_order.join(' → ')}**\nReply with new order as comma-separated values, e.g.: \`captain,map,server,draft\`\n*(This setting must be updated directly in the database for now)*`, flags: 64 })
      return
    }

    // Numeric settings — prompt with current value
    const numericMap: Record<string, { label: string; key: keyof BotConfig }> = {
      queue_size:              { label: 'Queue Size',              key: 'queue_size' },
      timeout:                 { label: 'Timeout (minutes)',       key: 'timeout_minutes' },
      activity_window_minutes: { label: 'Activity Window (min)',   key: 'activity_window_minutes' },
      sub_window_minutes:      { label: 'Sub Window (min)',        key: 'sub_window_minutes' },
      captain_cooldown_games:  { label: 'Captain Cooldown (games)', key: 'captain_cooldown_games' },
      map_count:               { label: 'Maps Per Vote (0 = all)', key: 'map_count' },
      vote_threshold:          { label: 'Vote Threshold',          key: 'vote_threshold' },
      captain_vote_seconds:    { label: 'Captain Vote (seconds)',  key: 'captain_vote_seconds' },
      map_vote_seconds:        { label: 'Map Vote (seconds)',       key: 'map_vote_seconds' },
      server_vote_seconds:     { label: 'Server Vote (seconds)',   key: 'server_vote_seconds' },
    }

    const setting = numericMap[settingKey]
    if (!setting) { await interaction.reply({ content: '❌ Unknown setting.', flags: 64 }); return }

    const current = botConfig[setting.key]

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(`setval_${settingKey}_minus`).setLabel('−').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId(`setval_${settingKey}_current`).setLabel(`${current}`).setStyle(ButtonStyle.Secondary).setDisabled(true),
      new ButtonBuilder().setCustomId(`setval_${settingKey}_plus`).setLabel('+').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`setval_${settingKey}_save`).setLabel('Save').setStyle(ButtonStyle.Primary),
    )

    await interaction.reply({ content: `**${setting.label}**\nCurrent: **${current}**\nUse − and + to adjust, then Save.`, components: [row], flags: 64 })
    return
  }

  // Settings value adjusters
  if (id.startsWith('setval_')) {
    if (!await isAdmin(interaction)) { await interaction.reply({ content: '❌ Admin only.', flags: 64 }); return }

    const parts = id.split('_')
    const action = parts[parts.length - 1]
    const settingKey = parts.slice(1, -1).join('_')

    const numericMap: Record<string, keyof BotConfig> = {
      queue_size:              'queue_size',
      timeout:                 'timeout_minutes',
      activity_window_minutes: 'activity_window_minutes',
      sub_window_minutes:      'sub_window_minutes',
      captain_cooldown_games:  'captain_cooldown_games',
      map_count:               'map_count',
      vote_threshold:          'vote_threshold',
      captain_vote_seconds:    'captain_vote_seconds',
      map_vote_seconds:        'map_vote_seconds',
      server_vote_seconds:     'server_vote_seconds',
    }

    const configKey = numericMap[settingKey]
    if (!configKey) { await interaction.reply({ content: '❌ Unknown setting.', flags: 64 }); return }

    const timeSettings = ['captain_vote_seconds', 'map_vote_seconds', 'server_vote_seconds']
    const step = timeSettings.includes(settingKey) ? 30 : 1
    let current = botConfig[configKey] as number
    if (action === 'minus') current = Math.max(0, current - step)
    else if (action === 'plus') current = current + step
    else if (action === 'save') {
      await supabase.from('twelve_man_config').update({ [configKey]: current }).eq('guild_id', DISCORD_GUILD_ID)
      await interaction.reply({ content: `✅ **${configKey}** saved as **${current}**.`, flags: 64 })
      return
    }

    ;(botConfig as any)[configKey] = current

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(`setval_${settingKey}_minus`).setLabel('−').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId(`setval_${settingKey}_current`).setLabel(`${current}`).setStyle(ButtonStyle.Secondary).setDisabled(true),
      new ButtonBuilder().setCustomId(`setval_${settingKey}_plus`).setLabel('+').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`setval_${settingKey}_save`).setLabel('Save').setStyle(ButtonStyle.Primary),
    )

    await interaction.update({ components: [row] })
    return
  }

  // Winner vote
  if (['winner_a', 'winner_b', 'winner_tie'].includes(id)) {
    if (!activeMatch) return
    if (!activeMatch.players.find(p => p.discordId === user.id)) { await interaction.reply({ content: '❌ You are not a participant in this match.', flags: 64 }); return }
    if (activeMatch.winnerVotes[user.id]) { await interaction.reply({ content: '⚠️ Already voted.', flags: 64 }); return }
    await interaction.deferUpdate()
    await handleWinnerVote(user.id, id === 'winner_a' ? 'a' : id === 'winner_b' ? 'b' : 'tie')
    return
  }

  if (id === 'vote_mvp' || id === 'vote_mvp_public') {
    await interaction.reply({ content: '🏆 MVP voting coming soon!', flags: 64 }); return
  }

  // Sub accept/decline
  if (id.startsWith('sub_accept_')) {
    if (!activeMatch) return
    const idx = parseInt(id.split('_')[2])
    const sub = activeMatch.waitlist[idx]
    if (!sub || sub.discordId !== user.id) return
    clearTimer(activeMatch, 'subWindow')
    activeMatch.players.push(sub)
    activeMatch.waitlist.splice(idx, 1)
    await interaction.reply({ content: `✅ ${sub.discordUsername} subbed in!` })
    const member = await safeOp(() => interaction.guild!.members.fetch(sub.discordId), 'fetch sub member')
    if (member?.voice.channelId) await safeOp(() => member.voice.setChannel(activeMatch!.gatherVoiceId), 'move sub to voice')
    if (activeMatch.players.length === botConfig.queue_size) await startVoteSequence()
    return
  }

  if (id.startsWith('sub_decline_')) {
    if (!activeMatch) return
    const idx = parseInt(id.split('_')[2])
    const sub = activeMatch.waitlist[idx]
    if (!sub || sub.discordId !== user.id) return
    clearTimer(activeMatch, 'subWindow')
    await interaction.deferUpdate()
    const afk = activeMatch.players.filter(p => !isFake(p) && !activeMatch!.confirmedInVoice.has(p.discordId))
    await tryNextSub(afk, idx + 1)
    return
  }
})

client.on('messageCreate', processKTP)
client.on('messageUpdate', async (_, msg) => {
  if (msg.channelId !== RESULTS_CHANNEL_ID || !msg.author?.bot) return
  const full = msg.partial ? await safeOp(() => msg.fetch(), 'fetch updated msg') : msg
  if (full) await processKTP(full as Message)
})

client.on('error', err => console.error('[bot] Client error:', err))
process.on('unhandledRejection', err => console.error('[bot] Unhandled rejection:', err))

client.login(DISCORD_BOT_TOKEN)
