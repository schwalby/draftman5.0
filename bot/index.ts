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
  VoiceState,
  PermissionsBitField,
} from 'discord.js'
import { createClient } from '@supabase/supabase-js'
import ws from 'ws'

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
const SUPABASE_URL          = process.env.SUPABASE_URL!
const SUPABASE_KEY          = process.env.SUPABASE_SERVICE_ROLE_KEY!
const API_BASE_URL          = process.env.API_BASE_URL!
const RESULTS_CHANNEL_ID    = process.env.RESULTS_CHANNEL_ID!
const QUEUE_CHANNEL_ID      = process.env.QUEUE_CHANNEL_ID!
const QUEUE_CATEGORY_ID     = '1130992813627154452'
const MATCH_THRESHOLD       = 8

let TEST_MODE = process.env.TEST_MODE === 'true'

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { realtime: { transport: ws as any } })

// ── ANSI helpers ──────────────────────────────────────────────────────────────
const A = {
  reset:  '\u001b[0m',
  green:  '\u001b[2;32m',
  red:    '\u001b[2;31m',
  yellow: '\u001b[2;33m',
  cyan:   '\u001b[2;36m',
  white:  '\u001b[2;37m',
  bold:   '\u001b[1m',
}
const ansi = (text: string) => `\`\`\`ansi\n${text}\n\`\`\``
const timeLeft = (endTime: number) => {
  const s = Math.max(0, Math.ceil((endTime - Date.now()) / 1000))
  return s >= 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s}s`
}

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
  mapVoteMsgId?: string
  serverVoteMsgId?: string
  draftMsgId?: string
  winnerVoteMsgId?: string
  dbMatchId?: string
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
}
const DEFAULT_CONFIG: BotConfig = {
  queue_size: 12, timeout_minutes: 90, activity_window_minutes: 5,
  sub_window_minutes: 2, captain_cooldown_games: 2, map_count: 5,
  vote_threshold: 7, captain_vote_seconds: 120, map_vote_seconds: 90,
  server_vote_seconds: 90,
  vote_order: ['captain', 'map', 'server', 'draft'],
  server_locations: ['Atlanta', 'Chicago', 'Dallas', 'Denver', 'New York'],
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

// ── ANSI vote list formatter ──────────────────────────────────────────────────
function voteList(items: string[], votes: Record<string, string>, highlight = false): string {
  const counts: Record<string, number> = {}
  for (const v of Object.values(votes)) counts[v] = (counts[v] ?? 0) + 1
  const max = Math.max(0, ...Object.values(counts))

  const lines = items.map((item, i) => {
    const n = counts[item] ?? 0
    const color = (highlight && n === max && n > 0) ? A.yellow : A.white
    return `${color}${String(i + 1).padStart(2)}) ${item.padEnd(22)} Votes: ${n}${A.reset}`
  })

  if (items.length <= 5) return lines.join('\n')
  const mid = Math.ceil(lines.length / 2)
  return lines.slice(0, mid).map((l, i) => lines[mid + i] ? `${l}   ${lines[mid + i]}` : l).join('\n')
}

// ── Button rows builder ───────────────────────────────────────────────────────
function buttonRows(labels: string[], prefix: string, style = ButtonStyle.Secondary): ActionRowBuilder<ButtonBuilder>[] {
  const rows: ActionRowBuilder<ButtonBuilder>[] = []
  let row = new ActionRowBuilder<ButtonBuilder>()
  let n = 0
  for (let i = 0; i < labels.length && i < 25; i++) {
    if (n === 5) { rows.push(row); row = new ActionRowBuilder<ButtonBuilder>(); n = 0 }
    row.addComponents(new ButtonBuilder().setCustomId(`${prefix}_${i}`).setLabel(labels[i]).setStyle(style))
    n++
  }
  if (n > 0) rows.push(row)
  return rows
}

// ── Safe Discord operation ────────────────────────────────────────────────────
async function safeOp<T>(fn: () => Promise<T>, label: string): Promise<T | null> {
  try { return await fn() }
  catch (err) { console.error(`[bot] ${label}:`, err); return null }
}

// ── Config loader ─────────────────────────────────────────────────────────────
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
  }

  // Move real players already in voice
  for (const p of realPlayers(players)) {
    const member = await safeOp(() => guild.members.fetch(p.discordId), `fetch member ${p.discordUsername}`)
    if (member?.voice.channelId) await safeOp(() => member.voice.setChannel(voiceCh.id), `move ${p.discordUsername}`)
  }

  const ping = realPlayers(players).map(p => `<@${p.discordId}>`).join(' ')
  const fakeName = TEST_MODE ? ` *(test mode — ${players.length - realPlayers(players).length} fake players)*` : ''
  await safeOp(() => textCh.send({
    content: `${ping}\n\n**Queue #${num} has started!${fakeName}** Join voice channel **Queue#${num}** to confirm your presence.\n\nYou have **${botConfig.activity_window_minutes} minutes** to join voice.`,
  }), 'send match start message')

  setTimer(activeMatch, 'activity', () => runActivityCheck(), botConfig.activity_window_minutes * 60 * 1000)
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
  const guild = client.guilds.cache.get(DISCORD_GUILD_ID)
  const ch = guild?.channels.cache.get(activeMatch.textChannelId) as TextChannel
  for (const p of afk) {
    const i = activeMatch.players.findIndex(x => x.discordId === p.discordId)
    if (i !== -1) activeMatch.players.splice(i, 1)
  }
  if (!activeMatch.waitlist.length) {
    const names = afk.map(p => `@${p.discordUsername}`).join(', ')
    await safeOp(() => ch.send({ content: `❌ Queue cancelled — ${names} did not join voice. Deleting in 18s.` }), 'send cancel msg')
    await cancelMatch(activeMatch.players)
    return
  }
  await tryNextSub(afk, 0)
}

async function tryNextSub(afk: QueuePlayer[], idx: number) {
  if (!activeMatch) return
  const guild = client.guilds.cache.get(DISCORD_GUILD_ID)
  const ch = guild?.channels.cache.get(activeMatch.textChannelId) as TextChannel
  if (idx >= activeMatch.waitlist.length) {
    await safeOp(() => ch.send({ content: `❌ No available subs. Deleting in 18s.` }), 'no subs msg')
    await cancelMatch(activeMatch.players)
    return
  }
  const sub = activeMatch.waitlist[idx]
  const afkNames = afk.map(p => `<@${p.discordId}>`).join(', ')
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`sub_accept_${idx}`).setLabel('✅ Accept').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`sub_decline_${idx}`).setLabel('❌ Decline').setStyle(ButtonStyle.Danger),
  )
  await safeOp(() => ch.send({ content: `<@${sub.discordId}> — ${afkNames} didn't join. Sub in?`, components: [row] }), 'sub prompt')
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
    .setDescription(`${A.yellow}Vote closes in ${timeLeft(end)}${A.reset} — you cannot vote for yourself\n${ansi(voteList(eligible.map(p => p.discordUsername), activeMatch!.captainVotes, true))}`)
    .setColor(0xF0B132)

  const labels = eligible.map((p, i) => `${i + 1}) ${p.discordUsername}`)
  const msg = await safeOp(() => ch.send({ embeds: [buildEmbed()], components: buttonRows(labels, 'captvote') }), 'send captain vote')
  if (msg) activeMatch.captainVoteMsgId = msg.id

  const interval = setInterval(async () => {
    if (!activeMatch?.captainVoteMsgId) { clearInterval(interval); return }
    const m = await safeOp(() => ch.messages.fetch(activeMatch!.captainVoteMsgId!), 'fetch captain vote msg')
    if (m) await safeOp(() => m.edit({ embeds: [buildEmbed()] }), 'update captain vote timer')
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
  for (const id of Object.values(activeMatch.captainVotes)) tally[id] = (tally[id] ?? 0) + 1

  const sorted = [...eligible].sort((a, b) => (tally[b.discordId] ?? 0) - (tally[a.discordId] ?? 0))
  const top = sorted[0]
  let second = sorted[1]
  if (sorted.length > 2 && (tally[sorted[1]?.discordId] ?? 0) === (tally[sorted[2]?.discordId] ?? 0)) {
    const tied = sorted.filter(p => (tally[p.discordId] ?? 0) === (tally[sorted[1].discordId] ?? 0))
    second = tied[Math.floor(Math.random() * tied.length)]
  }

  activeMatch.captainA = top
  activeMatch.captainB = second

  const votedIds = Object.keys(activeMatch.captainVotes)
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

  await safeOp(() => ch.send({ content: ansi(out) }), 'send captain result')
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
    await safeOp(() => ch.send({ content: '⚠️ No maps in pool — skipping map vote.' }), 'no maps msg')
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
    .setDescription(`${A.yellow}Vote closes in ${timeLeft(end)}${A.reset}\n${ansi(voteList(maps, activeMatch!.mapVotes, true))}`)
    .setColor(0x2D7D46)

  const msg = await safeOp(() => ch.send({ embeds: [buildEmbed()], components: buttonRows(maps.map((m, i) => `${i + 1}) ${m}`), 'mapvote') }), 'send map vote')
  if (msg) activeMatch.mapVoteMsgId = msg.id

  const interval = setInterval(async () => {
    if (!activeMatch?.mapVoteMsgId) { clearInterval(interval); return }
    const m = await safeOp(() => ch.messages.fetch(activeMatch!.mapVoteMsgId!), 'fetch map vote')
    if (m) await safeOp(() => m.edit({ embeds: [buildEmbed()] }), 'update map timer')
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

  await safeOp(() => ch.send({ content: ansi(out) }), 'send map result')
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
    .setDescription(`${A.yellow}Vote closes in ${timeLeft(end)}${A.reset}\n${ansi(voteList(servers, activeMatch!.serverVotes, true))}`)
    .setColor(0x5865F2)

  const msg = await safeOp(() => ch.send({ embeds: [buildEmbed()], components: buttonRows(servers.map((s, i) => `${i + 1}) ${s}`), 'servervote') }), 'send server vote')
  if (msg) activeMatch.serverVoteMsgId = msg.id

  const interval = setInterval(async () => {
    if (!activeMatch?.serverVoteMsgId) { clearInterval(interval); return }
    const m = await safeOp(() => ch.messages.fetch(activeMatch!.serverVoteMsgId!), 'fetch server vote')
    if (m) await safeOp(() => m.edit({ embeds: [buildEmbed()] }), 'update server timer')
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

  await safeOp(() => ch.send({ content: ansi(out) }), 'send server result')
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
    const m = await safeOp(() => ch.messages.fetch(activeMatch!.draftMsgId!), 'fetch draft board')
    if (m) { await safeOp(() => m.edit({ embeds: [embed], components: rows }), 'edit draft board'); return }
  }
  const msg = await safeOp(() => ch.send({ embeds: [embed], components: rows }), 'send draft board')
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

  await safeOp(() => ch.send({ embeds: [embed] }), 'send match summary')
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

  const msg = await safeOp(() => ch.send({ embeds: [embed], components: [row] }), 'send winner vote')
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
    const m = await safeOp(() => ch.messages.fetch(activeMatch!.winnerVoteMsgId!), 'fetch winner vote')
    if (m) {
      const embed = EmbedBuilder.from(m.embeds[0]).setFields(
        { name: activeMatch.captainA.discordUsername, value: `Votes: ${aCount}`, inline: true },
        { name: activeMatch.captainB.discordUsername, value: `Votes: ${bCount}`, inline: true },
        { name: 'Tie', value: `Votes: ${tCount}`, inline: true },
        { name: '\u200b', value: `${remaining} more votes required`, inline: false },
      )
      await safeOp(() => m.edit({ embeds: [embed] }), 'update winner vote')
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
  await safeOp(() => qCh.send({ embeds: [publicEmbed], components: [mvpRow] }), 'post public result')

  const textCh = guild?.channels.cache.get(activeMatch.textChannelId) as TextChannel
  await safeOp(() => textCh.send({ content: '✅ Result confirmed! Deleting channels in 18 seconds.' }), 'send cleanup notice')
  setTimeout(() => cleanupMatch(), 18000)
}

// ── Cleanup ───────────────────────────────────────────────────────────────────
async function cleanupMatch() {
  if (!activeMatch) return
  const guild = client.guilds.cache.get(DISCORD_GUILD_ID)
  clearAllTimers(activeMatch)
  for (const id of [activeMatch.textChannelId, activeMatch.gatherVoiceId, activeMatch.teamAVoiceId, activeMatch.teamBVoiceId].filter(Boolean) as string[]) {
    await safeOp(() => guild?.channels.cache.get(id)?.delete(), `delete channel ${id}`)
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
    .addSubcommand(s => s.setName('testmode').setDescription('Toggle test mode'))
    .addSubcommand(s => s.setName('config').setDescription('View current config'))
    .addSubcommand(s =>
      s.setName('cooldown').setDescription('Manage captain cooldowns')
        .addStringOption(o => o.setName('action').setDescription('reset or list').setRequired(true)
          .addChoices({ name: 'reset', value: 'reset' }, { name: 'list', value: 'list' }))
        .addUserOption(o => o.setName('player').setDescription('Player')))
    .addSubcommand(s =>
      s.setName('player').setDescription('Manage queue players')
        .addStringOption(o => o.setName('action').setRequired(true)
          .addChoices(
            { name: 'add', value: 'add' }, { name: 'remove', value: 'remove' },
            { name: 'ban', value: 'ban' }, { name: 'unban', value: 'unban' },
            { name: 'sub', value: 'sub' },
          ))
        .addUserOption(o => o.setName('player').setDescription('Target player').setRequired(true))
        .addUserOption(o => o.setName('replacement').setDescription('Replacement (for sub)')))
    .toJSON(),
]

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
    const ch = interaction.guild?.channels.cache.get(activeMatch.textChannelId) as TextChannel
    await safeOp(() => ch.send({ content: '⚠️ Match cancelled by admin. Re-queuing all players. Deleting in 18s.' }), 'cancel notice')
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
      await safeOp(() => ch.send({ content: `🔄 **${target.username}** → **${replacement.username}**` }), 'sub notice')
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

// ── Client ────────────────────────────────────────────────────────────────────
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.MessageContent,
  ],
})

client.once('clientReady', async () => {
  console.log(`[bot] Online as ${client.user?.tag} | TEST_MODE: ${TEST_MODE}`)
  await loadConfig()
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

  // Captain vote
  if (id.startsWith('captvote_')) {
    if (!activeMatch) return
    const idx = parseInt(id.split('_')[1])
    const candidate = activeMatch.captainCandidates[idx]
    if (!candidate) return
    if (user.id === candidate.discordId) { await interaction.reply({ content: '❌ Cannot vote for yourself.', flags: 64 }); return }
    if (activeMatch.captainVotes[user.id]) { await interaction.reply({ content: '⚠️ Already voted.', flags: 64 }); return }
    if (!isFake({ discordId: user.id, discordUsername: '', joinedAt: 0 }) && !activeMatch.players.find(p => p.discordId === user.id)) {
      await interaction.reply({ content: '❌ Not in this match.', flags: 64 }); return
    }
    activeMatch.captainVotes[user.id] = candidate.discordId
    const guild = interaction.guild
    const ch = guild?.channels.cache.get(activeMatch.textChannelId) as TextChannel
    if (activeMatch.captainVoteMsgId) {
      const m = await safeOp(() => ch.messages.fetch(activeMatch!.captainVoteMsgId!), 'fetch capt vote')
      if (m) {
        const embed = EmbedBuilder.from(m.embeds[0]).setDescription(
          `${A.yellow}Vote closes in ${timeLeft(activeMatch.captainVoteEndTime)}${A.reset} — you cannot vote for yourself\n${ansi(voteList(activeMatch.captainCandidates.map(p => p.discordUsername), activeMatch.captainVotes, true))}`
        )
        await safeOp(() => m.edit({ embeds: [embed] }), 'update capt vote')
      }
    }
    await interaction.reply({ content: `✅ Voted for **${candidate.discordUsername}**.`, flags: 64 })
    return
  }

  // Map vote
  if (id.startsWith('mapvote_')) {
    if (!activeMatch) return
    const map = activeMatch.mapOptions[parseInt(id.split('_')[1])]
    if (!map) return
    if (activeMatch.mapVotes[user.id]) { await interaction.reply({ content: '⚠️ Already voted.', flags: 64 }); return }
    activeMatch.mapVotes[user.id] = map
    const ch = interaction.guild?.channels.cache.get(activeMatch.textChannelId) as TextChannel
    if (activeMatch.mapVoteMsgId) {
      const m = await safeOp(() => ch.messages.fetch(activeMatch!.mapVoteMsgId!), 'fetch map vote')
      if (m) {
        const embed = EmbedBuilder.from(m.embeds[0]).setDescription(`${A.yellow}Vote closes in ${timeLeft(activeMatch.mapVoteEndTime)}${A.reset}\n${ansi(voteList(activeMatch.mapOptions, activeMatch.mapVotes, true))}`)
        await safeOp(() => m.edit({ embeds: [embed] }), 'update map vote')
      }
    }
    await interaction.reply({ content: `✅ Voted for **${map}**.`, flags: 64 })
    return
  }

  // Server vote
  if (id.startsWith('servervote_')) {
    if (!activeMatch) return
    const server = botConfig.server_locations[parseInt(id.split('_')[1])]
    if (!server) return
    if (activeMatch.serverVotes[user.id]) { await interaction.reply({ content: '⚠️ Already voted.', flags: 64 }); return }
    activeMatch.serverVotes[user.id] = server
    const ch = interaction.guild?.channels.cache.get(activeMatch.textChannelId) as TextChannel
    if (activeMatch.serverVoteMsgId) {
      const m = await safeOp(() => ch.messages.fetch(activeMatch!.serverVoteMsgId!), 'fetch server vote')
      if (m) {
        const embed = EmbedBuilder.from(m.embeds[0]).setDescription(`${A.yellow}Vote closes in ${timeLeft(activeMatch.serverVoteEndTime)}${A.reset}\n${ansi(voteList(botConfig.server_locations, activeMatch.serverVotes, true))}`)
        await safeOp(() => m.edit({ embeds: [embed] }), 'update server vote')
      }
    }
    await interaction.reply({ content: `✅ Voted for **${server}**.`, flags: 64 })
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

  // Winner vote
  if (['winner_a', 'winner_b', 'winner_tie'].includes(id)) {
    if (!activeMatch) return
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
    const member = await safeOp(() => interaction.guild?.members.fetch(sub.discordId), 'fetch sub member')
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
