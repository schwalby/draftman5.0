import {
  EmbedBuilder,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  TextChannel,
} from 'discord.js'
import { ActiveMatch, QueuePlayer } from '../core/types'
import { client } from '../core/client'
import { supabase } from '../core/supabase'
import { safeOp } from '../core/safeOp'
import { getConfig } from '../config/ConfigManager'
import { getHeader } from '../messaging/headers'
import { webhookSend, queueWebhook } from '../messaging/WebhookSender'
import { matchSend } from '../match/MatchManager'
import { decrementCooldowns } from '../cooldowns/cooldowns'

// ── Pending result state ──────────────────────────────────────────────────────
// ResultManager owns this state independently of ActiveMatch
// Winner vote lives on after channels are deleted

export interface PendingResult {
  matchNumber: number
  captainAId: string
  captainAName: string
  captainBId: string
  captainBName: string
  teamA: QueuePlayer[]
  teamB: QueuePlayer[]
  dbMatchId?: string
  winnerVotes: Record<string, string>
  winnerVoteMsgId?: string
  resultDelayTimer?: ReturnType<typeof setTimeout>
}

let _pendingResult: PendingResult | null = null
let _lockedPlayers = new Set<string>()

export function getPendingResult(): PendingResult | null { return _pendingResult }
export function getLockedPlayers(): Set<string> { return _lockedPlayers }
export function isPlayerLocked(discordId: string): boolean { return _lockedPlayers.has(discordId) }
export function clearLockedPlayers(): void { _lockedPlayers.clear() }

// ── Utility ───────────────────────────────────────────────────────────────────
function realPlayers(players: QueuePlayer[]): QueuePlayer[] {
  return players.filter(p => !p.fake)
}

// ── initiateResult ────────────────────────────────────────────────────────────
// Called after match channels are cleaned up
// Locks players and schedules winner vote in queue channel
export async function initiateResult(
  match: ActiveMatch,
  guildId: string,
  queueChannelId: string,
): Promise<void> {
  if (!match.captainA || !match.captainB) return

  const cfg = getConfig()

  // Lock all real players — cannot rejoin queue until result is confirmed
  _lockedPlayers = new Set(realPlayers(match.players).map(p => p.discordId))
  console.log(`[12man] ${_lockedPlayers.size} players locked pending result for match #${match.matchNumber}`)

  // Store pending result state — survives match cleanup
  _pendingResult = {
    matchNumber:  match.matchNumber,
    captainAId:   match.captainA.discordId,
    captainAName: match.captainA.discordUsername,
    captainBId:   match.captainB.discordId,
    captainBName: match.captainB.discordUsername,
    teamA:        [...match.teamA],
    teamB:        [...match.teamB],
    dbMatchId:    match.dbMatchId,
    winnerVotes:  {},
  }

  // Schedule winner vote after result_delay_minutes
  const delayMs = cfg.result_delay_minutes * 60 * 1000
  console.log(`[12man] Winner vote will post in ${cfg.result_delay_minutes} minutes`)

  _pendingResult.resultDelayTimer = setTimeout(async () => {
    await postWinnerVoteInQueueChannel(guildId, queueChannelId)
  }, delayMs)
}

// ── postWinnerVoteInQueueChannel ──────────────────────────────────────────────
// Posts winner vote embed in the queue channel after the delay
async function postWinnerVoteInQueueChannel(
  guildId: string,
  queueChannelId: string,
): Promise<void> {
  if (!_pendingResult) return
  const cfg = getConfig()
  const guild = client.guilds.cache.get(guildId)
  const qCh = guild?.channels.cache.get(queueChannelId) as TextChannel

  const embed = new EmbedBuilder()
    .setTitle(`🏆 Winner for Queue#${_pendingResult.matchNumber} 🏆`)
    .setDescription(`Vote for the winning team.\n\n**${cfg.vote_threshold} votes required to confirm**\n\n⚠️ Queue is locked until voting completes.`)
    .addFields(
      { name: _pendingResult.captainAName, value: 'Votes: 0', inline: true },
      { name: _pendingResult.captainBName, value: 'Votes: 0', inline: true },
      { name: 'Tie', value: 'Votes: 0', inline: true },
    )
    .setColor(0xF0B132)

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId('winner_a').setLabel(_pendingResult.captainAName).setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('winner_b').setLabel(_pendingResult.captainBName).setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('winner_tie').setLabel('Tie').setStyle(ButtonStyle.Secondary),
  )

  if (queueWebhook) {
    await webhookSend(queueWebhook, { content: getHeader('winner', cfg.header_style) }, 'post winner header')
    const msg = await webhookSend(queueWebhook, { embeds: [embed], components: [row] }, 'post winner vote')
    if (msg && _pendingResult) _pendingResult.winnerVoteMsgId = msg.id
  } else {
    await safeOp(() => qCh.send({ content: getHeader('winner', cfg.header_style) }), 'post winner header')
    const msg = await safeOp(() => qCh.send({ embeds: [embed], components: [row] }), 'post winner vote')
    if (msg && _pendingResult) _pendingResult.winnerVoteMsgId = msg.id
  }
}

// ── handleWinnerVote ──────────────────────────────────────────────────────────
// Called when a player clicks a winner vote button in the queue channel
export async function handleWinnerVote(
  voterId: string,
  choice: 'a' | 'b' | 'tie',
  guildId: string,
  queueChannelId: string,
): Promise<void> {
  if (!_pendingResult) return
  _pendingResult.winnerVotes[voterId] = choice

  const cfg = getConfig()
  const aCount = Object.values(_pendingResult.winnerVotes).filter(v => v === 'a').length
  const bCount = Object.values(_pendingResult.winnerVotes).filter(v => v === 'b').length
  const tCount = Object.values(_pendingResult.winnerVotes).filter(v => v === 'tie').length
  const remaining = Math.max(0, cfg.vote_threshold - Math.max(aCount, bCount, tCount))

  // Update vote counts in embed
  if (_pendingResult.winnerVoteMsgId) {
    const updatedEmbed = new EmbedBuilder()
      .setTitle(`🏆 Winner for Queue#${_pendingResult.matchNumber} 🏆`)
      .setDescription(`**${cfg.vote_threshold} votes required**\n⚠️ Queue is locked until voting completes.`)
      .setColor(0xF0B132)
      .addFields(
        { name: _pendingResult.captainAName, value: `Votes: ${aCount}`, inline: true },
        { name: _pendingResult.captainBName, value: `Votes: ${bCount}`, inline: true },
        { name: 'Tie', value: `Votes: ${tCount}`, inline: true },
        { name: '\u200b', value: `${remaining} more votes required`, inline: false },
      )

    if (queueWebhook) {
      await safeOp(() => queueWebhook.editMessage(_pendingResult!.winnerVoteMsgId!, { embeds: [updatedEmbed] }), 'update winner vote')
    } else {
      const guild = client.guilds.cache.get(guildId)
      const qCh = guild?.channels.cache.get(queueChannelId) as TextChannel
      const m = await safeOp(() => qCh.messages.fetch(_pendingResult!.winnerVoteMsgId!), 'fetch winner vote')
      if (m) await safeOp(() => m.edit({ embeds: [updatedEmbed] }), 'update winner vote')
    }
  }

  if (aCount >= cfg.vote_threshold || bCount >= cfg.vote_threshold || tCount >= cfg.vote_threshold) {
    const winner = aCount >= cfg.vote_threshold ? 'a' : bCount >= cfg.vote_threshold ? 'b' : 'tie'
    await resolveWinner(winner, guildId, queueChannelId)
  }
}

// ── resolveWinner ─────────────────────────────────────────────────────────────
export async function resolveWinner(
  winner: 'a' | 'b' | 'tie',
  guildId: string,
  queueChannelId: string,
): Promise<void> {
  if (!_pendingResult) return
  const cfg = getConfig()
  const guild = client.guilds.cache.get(guildId)
  const qCh = guild?.channels.cache.get(queueChannelId) as TextChannel

  const winCap    = winner === 'a' ? _pendingResult.captainAName : winner === 'b' ? _pendingResult.captainBName : null
  const loseCap   = winner === 'a' ? _pendingResult.captainBName : _pendingResult.captainAName
  const winTeam   = winner === 'a' ? _pendingResult.teamA : winner === 'b' ? _pendingResult.teamB : []
  const loseTeam  = winner === 'a' ? _pendingResult.teamB : winner === 'b' ? _pendingResult.teamA : []

  // Update DB
  if (_pendingResult.dbMatchId) {
    await supabase
      .from('twelve_man_matches')
      .update({ winner_side: winner, status: 'complete', completed_at: new Date().toISOString() })
      .eq('id', _pendingResult.dbMatchId)
  }

  // Decrement cooldowns
  await decrementCooldowns(_pendingResult.captainAId, _pendingResult.captainBId)

  // Post public result
  const winMentions  = realPlayers(winTeam).map(p => `<@${p.discordId}>`).join(' ')
  const loseMentions = realPlayers(loseTeam).map(p => `<@${p.discordId}>`).join(' ')

  const publicEmbed = new EmbedBuilder()
    .setTitle(`🏆 Queue#${_pendingResult.matchNumber} — Result Confirmed 🏆`)
    .addFields(
      winner !== 'tie'
        ? [
            { name: `${winCap} — Winners`, value: winMentions || '—', inline: true },
            { name: `${loseCap} — Losers`, value: loseMentions || '—', inline: true },
          ]
        : [
            { name: _pendingResult.captainAName, value: realPlayers(_pendingResult.teamA).map(p => `<@${p.discordId}>`).join(' ') || '—', inline: true },
            { name: _pendingResult.captainBName, value: realPlayers(_pendingResult.teamB).map(p => `<@${p.discordId}>`).join(' ') || '—', inline: true },
            { name: 'Result', value: 'Tie', inline: false },
          ]
    )
    .setColor(winner === 'tie' ? 0x949BA4 : 0xF0B132)

  const mvpRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId('vote_mvp_public').setLabel('🏆 Vote MVP').setStyle(ButtonStyle.Success),
  )

  if (queueWebhook) {
    await webhookSend(queueWebhook, { embeds: [publicEmbed], components: [mvpRow] }, 'post public result')
  } else {
    await safeOp(() => qCh.send({ embeds: [publicEmbed], components: [mvpRow] }), 'post public result')
  }

  // Unlock players — queue is open again
  _lockedPlayers.clear()
  console.log('[12man] Players unlocked — queue open')

  // Clear pending result
  if (_pendingResult.resultDelayTimer) clearTimeout(_pendingResult.resultDelayTimer)
  _pendingResult = null
}

// ── Legacy: in-match winner vote (KTP bridge triggers this before channels deleted) ──
// Preserved for KTP bridge compatibility — posts in match channel, then transitions to result flow
export async function postWinnerVote(
  match: ActiveMatch,
  map: string | null,
  alliesScore: number,
  axisScore: number,
  side: string,
  guildId: string,
  queueChannelId: string,
): Promise<void> {
  if (!match.captainA || !match.captainB) return
  const cfg = getConfig()

  const embed = new EmbedBuilder()
    .setTitle(`🏆 Winner for Queue#${match.matchNumber} 🏆`)
    .setDescription(`**${side} wins ${alliesScore}-${axisScore}${map ? ` on ${map}` : ''}**\n\n${cfg.vote_threshold} votes required`)
    .addFields(
      { name: match.captainA.discordUsername, value: 'Votes: 0', inline: true },
      { name: match.captainB.discordUsername, value: 'Votes: 0', inline: true },
      { name: 'Tie', value: 'Votes: 0', inline: true },
    )
    .setColor(0xF0B132)

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId('winner_a').setLabel(match.captainA.discordUsername).setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('winner_b').setLabel(match.captainB.discordUsername).setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('winner_tie').setLabel('Tie').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('vote_mvp').setLabel('🏆 Vote MVP').setStyle(ButtonStyle.Success),
  )

  const msg = await matchSend(match, { embeds: [embed], components: [row] }, 'send winner vote', guildId)
  if (msg) match.winnerVoteMsgId = msg.id
}
