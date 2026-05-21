import {
  ChannelType,
  PermissionFlagsBits,
  EmbedBuilder,
  TextChannel,
  VoiceChannel,
  WebhookClient,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
} from 'discord.js'
import { ActiveMatch, QueuePlayer } from '../core/types'
import { client } from '../core/client'
import { safeOp } from '../core/safeOp'
import { getConfig } from '../config/ConfigManager'
import { webhookSend } from '../messaging/WebhookSender'
import { getTitle } from '../messaging/headers'
import { ansi } from '../messaging/ansi'
import { requeueAll } from '../queue/QueueManager'

// ── Match state ───────────────────────────────────────────────────────────────
// MatchManager owns activeMatch state
let _activeMatch: ActiveMatch | null = null
let _matchCounter = 0

export function getActiveMatch(): ActiveMatch | null { return _activeMatch }
export function setActiveMatch(m: ActiveMatch | null): void { _activeMatch = m }
export function getMatchCounter(): number { return _matchCounter }
export function setMatchCounter(n: number): void { _matchCounter = n }
export function incrementMatchCounter(): number { return ++_matchCounter }

// ── Timer helpers ─────────────────────────────────────────────────────────────
export function clearTimer(match: ActiveMatch, key: Parameters<Map<any, any>['get']>[0]): void {
  const t = match.timers.get(key)
  if (t !== undefined) { clearTimeout(t); match.timers.delete(key) }
}
export function clearAllTimers(match: ActiveMatch): void {
  for (const t of match.timers.values()) clearTimeout(t)
  match.timers.clear()
}
export function setTimer(match: ActiveMatch, key: any, fn: () => void, ms: number): void {
  clearTimer(match, key)
  match.timers.set(key, setTimeout(fn, ms))
}

// ── Utility ───────────────────────────────────────────────────────────────────
function realPlayers(players: QueuePlayer[]): QueuePlayer[] {
  return players.filter(p => !p.fake)
}

// ── matchSend ─────────────────────────────────────────────────────────────────
// Send to active match channel via webhook or bot fallback
export async function matchSend(
  match: ActiveMatch,
  payload: any,
  label: string,
  guildId: string,
): Promise<any> {
  if (match.matchWebhook) {
    return webhookSend(match.matchWebhook, payload, label)
  }
  const guild = client.guilds.cache.get(guildId)
  const ch = guild?.channels.cache.get(match.textChannelId) as TextChannel
  return safeOp(() => ch.send(payload), label)
}

// ── initiateMatch ─────────────────────────────────────────────────────────────
// Preserved exactly from index.ts — no logic changes
export async function initiateMatch(
  players: QueuePlayer[],
  waitlist: QueuePlayer[],
  guildId: string,
  queueCategoryId: string,
  testMode: boolean,
  onStartVoteSequence: () => Promise<void>,
  onActivityCheck: () => Promise<void>,
): Promise<void> {
  if (_activeMatch) return
  const guild = client.guilds.cache.get(guildId)
  if (!guild) return

  const cfg = getConfig()
  const num = incrementMatchCounter()
  console.log(`[12man] Starting match #${num} with ${players.length} players`)

  const adminRoleNames = ['Administrator', 'Sapphire', 'Spectator', 'ModMail', '12man special privileges', 'Chanserv']
  const adminRoleIds = adminRoleNames
    .map(name => guild.roles.cache.find(r => r.name === name)?.id)
    .filter(Boolean) as string[]

  const seen = new Set<string>()
  const permOverwrites: any[] = [
    { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
    { id: client.user!.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.MoveMembers] },
  ]
  seen.add(guild.roles.everyone.id)
  seen.add(client.user!.id)
  for (const p of players) {
    if (!p.fake && !seen.has(p.discordId)) {
      permOverwrites.push({ id: p.discordId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak] })
      seen.add(p.discordId)
    }
  }
  for (const id of adminRoleIds) {
    if (!seen.has(id)) { permOverwrites.push({ id, allow: [PermissionFlagsBits.ViewChannel] }); seen.add(id) }
  }

  const textCh = await safeOp(() => guild.channels.create({ name: `queue-${num}`, type: ChannelType.GuildText, parent: queueCategoryId, permissionOverwrites: permOverwrites }), 'create text channel')
  const voiceCh = await safeOp(() => guild.channels.create({ name: `Queue#${num}`, type: ChannelType.GuildVoice, parent: queueCategoryId, permissionOverwrites: permOverwrites }), 'create gather voice')
  if (!textCh || !voiceCh) { console.error('[12man] Channel creation failed'); return }

  const matchWh = await safeOp(() => (textCh as TextChannel).createWebhook({ name: 'DRAFT MAN 5.0', avatar: client.user?.avatarURL() ?? undefined }), 'create match webhook')
  const matchWebhook = matchWh ? new WebhookClient({ id: matchWh.id, token: matchWh.token! }) : null

  _activeMatch = {
    matchNumber: num,
    status: 'gathering',
    textChannelId: textCh.id,
    gatherVoiceId: voiceCh.id,
    players: [...players],
    waitlist: [...waitlist],
    confirmedInVoice: new Set(),
    activityCheckDone: false,
    captainA: undefined,
    captainB: undefined,
    teamA: [],
    teamB: [],
    voteOrder: [...cfg.vote_order],
    currentStep: 0,
    captainCandidates: [],
    captainVotes: {},
    mapOptions: [],
    mapVotes: {},
    serverVotes: {},
    winnerVotes: {},
    draftPickIndex: 0,
    draftOrder: [],
    remainingPlayers: [],
    captainVoteEndTime: 0,
    mapVoteEndTime: 0,
    serverVoteEndTime: 0,
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
  const fakeName = testMode ? ` *(test mode — ${players.length - realPlayers(players).length} fake players)*` : ''
  const startEmbed = new EmbedBuilder()
    .setTitle(getTitle('queuePopped'))
    .setDescription(`${ping}\n\n**Queue #${num} has started!${fakeName}** Join voice channel **Queue#${num}** to confirm your presence.\n\nYou have **${cfg.activity_window_minutes} minutes** to join voice.`)
    .setColor(0x5865F2)

  if (matchWebhook) {
    await webhookSend(matchWebhook, { embeds: [startEmbed] }, 'send match start via webhook')
  } else {
    await safeOp(() => (textCh as TextChannel).send({ embeds: [startEmbed] }), 'send match start message')
  }

  setTimer(_activeMatch, 'activity', onActivityCheck, cfg.activity_window_minutes * 60 * 1000)

  if (testMode) {
    clearTimer(_activeMatch!, 'activity')
    _activeMatch!.activityCheckDone = true
    _activeMatch!.confirmedInVoice = new Set(realPlayers(players).map(p => p.discordId))
    setTimeout(() => onStartVoteSequence(), 2000)
  }
}

// ── runActivityCheck ──────────────────────────────────────────────────────────
export async function runActivityCheck(
  guildId: string,
  onVoteSequence: () => Promise<void>,
  onHandleAfk: (afk: QueuePlayer[]) => Promise<void>,
): Promise<void> {
  if (!_activeMatch || _activeMatch.activityCheckDone) return
  const guild = client.guilds.cache.get(guildId)
  const gatherCh = guild?.channels.cache.get(_activeMatch.gatherVoiceId) as VoiceChannel
  const inVoice = new Set([...(gatherCh?.members.keys() ?? [])].filter(id => id !== client.user!.id))
  const afk = _activeMatch.players.filter(p => !p.fake && !inVoice.has(p.discordId))

  _activeMatch.confirmedInVoice = inVoice
  _activeMatch.activityCheckDone = true

  console.log(`[12man] Activity check: ${inVoice.size} confirmed, ${afk.length} AFK`)
  if (afk.length === 0) { await onVoteSequence(); return }
  await onHandleAfk(afk)
}

// ── checkEarlyConfirm ─────────────────────────────────────────────────────────
export async function checkEarlyConfirm(
  guildId: string,
  onVoteSequence: () => Promise<void>,
): Promise<void> {
  if (!_activeMatch || _activeMatch.activityCheckDone) return
  const guild = client.guilds.cache.get(guildId)
  const ch = guild?.channels.cache.get(_activeMatch.gatherVoiceId) as VoiceChannel
  const inVoice = new Set([...(ch?.members.keys() ?? [])].filter(id => id !== client.user!.id))
  const allConfirmed = realPlayers(_activeMatch.players).every(p => inVoice.has(p.discordId))
  if (!allConfirmed) return
  _activeMatch.activityCheckDone = true
  clearTimer(_activeMatch, 'activity')
  _activeMatch.confirmedInVoice = inVoice
  console.log('[12man] All players confirmed early — starting votes')
  await onVoteSequence()
}

// ── handleAfk ─────────────────────────────────────────────────────────────────
export async function handleAfk(
  afk: QueuePlayer[],
  guildId: string,
  queueChannelId: string,
  apiBaseUrl: string,
  onTryNextSub: (afk: QueuePlayer[], idx: number) => Promise<void>,
  onCancel: (players: QueuePlayer[]) => Promise<void>,
): Promise<void> {
  if (!_activeMatch) return
  for (const p of afk) {
    const i = _activeMatch.players.findIndex(x => x.discordId === p.discordId)
    if (i !== -1) _activeMatch.players.splice(i, 1)
  }
  if (!_activeMatch.waitlist.length) {
    const names = afk.map(p => `@${p.discordUsername}`).join(', ')
    await matchSend(_activeMatch, { content: `❌ Queue cancelled — ${names} did not join voice. Deleting in 18s.` }, 'send cancel msg', guildId)
    await onCancel(_activeMatch.players)
    return
  }
  await onTryNextSub(afk, 0)
}

// ── tryNextSub ────────────────────────────────────────────────────────────────
export async function tryNextSub(
  afk: QueuePlayer[],
  idx: number,
  guildId: string,
  onCancel: (players: QueuePlayer[]) => Promise<void>,
): Promise<void> {
  if (!_activeMatch) return
  if (idx >= _activeMatch.waitlist.length) {
    await matchSend(_activeMatch, { content: `❌ No available subs. Deleting in 18s.` }, 'no subs msg', guildId)
    await onCancel(_activeMatch.players)
    return
  }
  const sub = _activeMatch.waitlist[idx]
  const afkNames = afk.map(p => `<@${p.discordId}>`).join(', ')
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`sub_accept_${idx}`).setLabel('✅ Accept').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`sub_decline_${idx}`).setLabel('❌ Decline').setStyle(ButtonStyle.Danger),
  )
  await matchSend(_activeMatch, { content: `<@${sub.discordId}> — ${afkNames} didn't join. Sub in?`, components: [row] }, 'sub prompt', guildId)
  setTimer(_activeMatch, 'subWindow', () => tryNextSub(afk, idx + 1, guildId, onCancel), getConfig().sub_window_minutes * 60 * 1000)
}

// ── cancelMatch ───────────────────────────────────────────────────────────────
export async function cancelMatch(
  players: QueuePlayer[],
  guildId: string,
  queueChannelId: string,
  apiBaseUrl: string,
): Promise<void> {
  const saved = [...players]
  await cleanupMatch(guildId)
  await requeueAll(saved, guildId, queueChannelId, apiBaseUrl)
}

// ── cleanupMatch ──────────────────────────────────────────────────────────────
export async function cleanupMatch(guildId: string): Promise<void> {
  if (!_activeMatch) return
  const guild = client.guilds.cache.get(guildId)
  clearAllTimers(_activeMatch)

  if (_activeMatch.matchWebhook) {
    _activeMatch.matchWebhook.destroy()
  }

  for (const id of [_activeMatch.textChannelId, _activeMatch.teamAVoiceId, _activeMatch.teamBVoiceId].filter(Boolean) as string[]) {
    try { await guild?.channels.cache.get(id)?.delete() } catch { /* already gone */ }
  }
  _activeMatch = null
  console.log('[12man] Match cleaned up')
}
