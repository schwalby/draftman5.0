import {
  ChannelType,
  PermissionFlagsBits,
  EmbedBuilder,
  TextChannel,
  VoiceChannel,
} from 'discord.js'
import { ActiveMatch, QueuePlayer } from '../core/types'
import { client } from '../core/client'
import { supabase } from '../core/supabase'
import { safeOp } from '../core/safeOp'
import { getConfig } from '../config/ConfigManager'
import { A, ansi } from '../messaging/ansi'
import { buttonRows } from '../messaging/embeds'
import { getHeader } from '../messaging/headers'
import { webhookSend } from '../messaging/WebhookSender'
import { matchSend } from '../match/MatchManager'

// ── Utility ───────────────────────────────────────────────────────────────────
function realPlayers(players: QueuePlayer[]): QueuePlayer[] {
  return players.filter(p => !p.fake)
}

// ── startDraft ────────────────────────────────────────────────────────────────
// Preserved exactly from index.ts — no logic changes
export async function startDraft(
  match: ActiveMatch,
  guildId: string,
  onPostDraft: () => Promise<void>,
): Promise<void> {
  if (!match.captainA || !match.captainB) return
  match.draftOrder = [0, 1, 1, 0, 0, 1, 1, 0, 0, 1]
  match.draftPickIndex = 0
  match.teamA = [match.captainA]
  match.teamB = [match.captainB]
  match.remainingPlayers = match.players.filter(
    p => p.discordId !== match.captainA!.discordId && p.discordId !== match.captainB!.discordId,
  )
  if (!match.remainingPlayers.length) { await onPostDraft(); return }
  await sendDraftBoard(match, guildId, onPostDraft)
}

// ── sendDraftBoard ────────────────────────────────────────────────────────────
// Preserved exactly from index.ts — no logic changes
export async function sendDraftBoard(
  match: ActiveMatch,
  guildId: string,
  onPostDraft: () => Promise<void>,
): Promise<void> {
  if (!match.captainA || !match.captainB) return
  const guild = client.guilds.cache.get(guildId)
  const cfg = getConfig()

  const pickIdx = match.draftOrder[match.draftPickIndex]
  const active = pickIdx === 0 ? match.captainA : match.captainB

  const teamAText  = match.teamA.map(p => `${A.green}${p.discordUsername}${A.reset}`).join('\n') || '—'
  const teamBText  = match.teamB.map(p => `${A.red}${p.discordUsername}${A.reset}`).join('\n') || '—'
  const remaining  = match.remainingPlayers.map((p, i) => `${A.white}${i + 1}) ${p.discordUsername}${A.reset}`).join('  ')

  const embed = new EmbedBuilder()
    .setTitle(`Draft — ${active.discordUsername} picks`)
    .addFields(
      { name: `🟢 ${match.captainA.discordUsername} (Allies)`, value: `\`\`\`ansi\n${teamAText}\n\`\`\``, inline: true },
      { name: `🔴 ${match.captainB.discordUsername} (Axis)`,   value: `\`\`\`ansi\n${teamBText}\n\`\`\``, inline: true },
      { name: 'Remaining', value: `\`\`\`ansi\n${remaining}\n\`\`\``, inline: false },
    )
    .setColor(0x5865F2)

  const labels = match.remainingPlayers.map((p, i) => `${i + 1}) ${p.discordUsername}`)
  const rows   = buttonRows(labels, 'draftpick')

  if (match.draftMsgId) {
    if (match.matchWebhook) {
      await safeOp(() => match.matchWebhook!.editMessage(match.draftMsgId!, { embeds: [embed], components: rows }), 'edit draft board')
      return
    }
    const ch = guild?.channels.cache.get(match.textChannelId) as TextChannel
    const m  = await safeOp(() => ch.messages.fetch(match.draftMsgId!), 'fetch draft board')
    if (m) { await safeOp(() => m.edit({ embeds: [embed], components: rows }), 'edit draft board'); return }
  }

  await matchSend(match, { content: getHeader('snakeDraft', cfg.header_style) }, 'send draft header', guildId)
  const msg = await matchSend(match, { embeds: [embed], components: rows }, 'send draft board', guildId)
  if (msg) match.draftMsgId = msg.id
}

// ── handlePick ────────────────────────────────────────────────────────────────
// Preserved exactly from index.ts — no logic changes
export async function handlePick(
  match: ActiveMatch,
  idx: number,
  guildId: string,
  onPostDraft: () => Promise<void>,
): Promise<void> {
  if (!match.captainA || !match.captainB) return
  const picked = match.remainingPlayers[idx]
  if (!picked) return
  if (match.draftOrder[match.draftPickIndex] === 0) match.teamA.push(picked)
  else match.teamB.push(picked)
  match.remainingPlayers.splice(idx, 1)
  match.draftPickIndex++
  if (!match.remainingPlayers.length) await onPostDraft()
  else await sendDraftBoard(match, guildId, onPostDraft)
}

// ── startPostDraft ────────────────────────────────────────────────────────────
// Preserved exactly from index.ts — no logic changes
export async function startPostDraft(
  match: ActiveMatch,
  guildId: string,
  queueCategoryId: string,
): Promise<void> {
  if (!match.captainA || !match.captainB) return
  const guild = client.guilds.cache.get(guildId)
  if (!guild) return
  const cfg = getConfig()
  const num = match.matchNumber

  const seen = new Set<string>([guild.roles.everyone.id, client.user!.id])
  const perms: any[] = [
    { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
    { id: client.user!.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.MoveMembers] },
  ]
  for (const p of match.players) {
    if (!p.fake && !seen.has(p.discordId)) {
      perms.push({ id: p.discordId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak] })
      seen.add(p.discordId)
    }
  }

  const voiceA = await safeOp(() => guild.channels.create({ name: `${match.captainA!.discordUsername} - #${num}`, type: ChannelType.GuildVoice, parent: queueCategoryId, permissionOverwrites: perms }), 'create team A voice')
  const voiceB = await safeOp(() => guild.channels.create({ name: `${match.captainB!.discordUsername} - #${num}`, type: ChannelType.GuildVoice, parent: queueCategoryId, permissionOverwrites: perms }), 'create team B voice')
  if (!voiceA || !voiceB) return

  match.teamAVoiceId = voiceA.id
  match.teamBVoiceId = voiceB.id

  const moveAll = async (team: QueuePlayer[], dest: VoiceChannel) => {
    for (const p of realPlayers(team)) {
      const m = await safeOp(() => guild.members.fetch(p.discordId), `fetch ${p.discordUsername}`)
      if (m?.voice.channelId) await safeOp(() => m.voice.setChannel(dest.id), `move ${p.discordUsername}`)
    }
  }
  await Promise.all([moveAll(match.teamA, voiceA as VoiceChannel), moveAll(match.teamB, voiceB as VoiceChannel)])

  const { data: dbMatch } = await supabase.from('twelve_man_matches').insert({
    match_number: num, guild_id: guildId, queue_channel_id: match.textChannelId,
    captain_a_discord_id: match.captainA.discordId,
    captain_b_discord_id: match.captainB.discordId,
    team_a: match.teamA.map(p => ({ discord_id: p.discordId, username: p.discordUsername })),
    team_b: match.teamB.map(p => ({ discord_id: p.discordId, username: p.discordUsername })),
    map: match.selectedMap ?? null,
    server_location: match.selectedServer ?? null,
    status: 'in_progress',
  }).select('id').maybeSingle()
  if (dbMatch) match.dbMatchId = dbMatch.id

  const embed = new EmbedBuilder()
    .setTitle(`⚔️ Queue#${num}`)
    .addFields(
      { name: `🟢 ${match.captainA.discordUsername} (Allies)`, value: match.teamA.map(p => `<@${p.discordId}>`).join(' ') || '—', inline: true },
      { name: `🔴 ${match.captainB.discordUsername} (Axis)`,   value: match.teamB.map(p => `<@${p.discordId}>`).join(' ') || '—', inline: true },
      { name: 'Map',      value: match.selectedMap    ?? 'TBD', inline: true },
      { name: 'Location', value: match.selectedServer ?? 'TBD', inline: true },
      { name: '🔊 Voice', value: `<#${voiceA.id}> · <#${voiceB.id}>`, inline: false },
    )
    .setColor(0x5865F2)

  await matchSend(match, { content: getHeader('matchSummary', cfg.header_style) }, 'send match summary header', guildId)
  await matchSend(match, { embeds: [embed] }, 'send match summary', guildId)

  // Delete gather voice — players moved to team channels
  await safeOp(() => (guild.channels.cache.get(match.gatherVoiceId) as VoiceChannel | undefined)?.delete() as Promise<VoiceChannel>, 'delete gather voice')

  console.log(`[12man] Match #${num} ready`)
}
